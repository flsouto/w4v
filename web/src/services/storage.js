import { fileFromRecord } from './library-files.js';

const DB_NAME = 'audioSamplerDB'
const STORE_NAME = 'audioFiles'
const DB_VERSION = 1

class StorageService {
  constructor() {
    this.db = null
    this.initPromise = null
    this.sessionFiles = null
    this.storageEstimate = null
  }

  useTemporaryLibrary() {
    this.db?.close();
    this.db = null;
    this.sessionFiles = new Map();
  }

  async reconnect() {
    this.db?.close();
    this.db = null;
    this.initPromise = null;
    await this.ensureInitialized();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        reject(request.error)
      }

      request.onsuccess = (event) => {
        this.db = event.target.result
        this.updateStorageEstimate()
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
    })
  }

  async updateStorageEstimate() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        this.storageEstimate = await navigator.storage.estimate()
        return this.storageEstimate
      } catch (error) {
        console.error('Error getting storage estimate:', error)
        return null
      }
    }
    return null
  }

  async getStorageInfo() {
    await this.ensureInitialized()
    if (this.sessionFiles) {
      const used = [...this.sessionFiles.values()].reduce((sum, file) => sum + file.size, 0);
      return { used, total: 0, available: 0, percentUsed: 0 };
    }
    const estimate = await this.updateStorageEstimate()

    if (!estimate) {
      return {
        used: 0,
        total: 0,
        available: 0,
        percentUsed: 0
      }
    }

    return {
      used: estimate.usage || 0,
      total: estimate.quota || 0,
      available: (estimate.quota - estimate.usage) || 0,
      percentUsed: ((estimate.usage / estimate.quota) * 100) || 0
    }
  }

  async ensureInitialized() {
    if (this.sessionFiles) return;
    if (!this.db) {
      this.initPromise ||= this.init().catch(error => { this.initPromise = null; throw error; });
      await this.initPromise;
    }
  }

  async canStoreFile(fileSize) {
    const info = await this.getStorageInfo()
    return info.total === 0 || fileSize <= info.available
  }

  async saveFile(file, metadata = {}) {
    await this.ensureInitialized()

    if (!(await this.canStoreFile(file.size))) {
      throw new Error('Not enough storage space')
    }

    // Get the array buffer first, outside the transaction
    const buffer = await file.arrayBuffer()

    const fileObj = {
      id: file.id || crypto.randomUUID(), name: file.name, type: file.type,
      size: file.size, data: buffer, lastModified: file.lastModified,
      favorite: file.favorite || metadata.favorite || false,
      isGenerated: file.isGenerated || metadata.isGenerated || false,
      storePack: file.storePack || metadata.storePack || null,
    };
    if (this.sessionFiles) { this.sessionFiles.set(fileObj.id, fileObj); return fileObj; }
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      transaction.oncomplete = () => resolve(fileObj)

      transaction.onerror = () => {
        reject(transaction.error)
      }

      transaction.onabort = () => {
        reject(new Error('Transaction was aborted'))
      }

      const request = store.put(fileObj)
      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  async getAllFiles() {
    await this.ensureInitialized()
    if (this.sessionFiles) return [...this.sessionFiles.values()].map(fileFromRecord);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const files = [];
      // Avoid returning the entire audio library in one IndexedDB response.
      const request = transaction.objectStore(STORE_NAME).openCursor();
      transaction.oncomplete = () => resolve(files);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Library read was interrupted'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        try { files.push(fileFromRecord(cursor.value)); cursor.continue(); }
        catch (error) { reject(error); transaction.abort(); }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteFile(fileId) {
    return this.deleteFiles([fileId]);
  }

  async deleteFiles(fileIds) {
    await this.ensureInitialized();
    if (this.sessionFiles) { for (const id of fileIds) this.sessionFiles.delete(id); return; }
    return new Promise((resolve,reject)=>{
      const transaction=this.db.transaction([STORE_NAME],'readwrite');
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error);
      transaction.onabort=()=>reject(transaction.error || new Error('Transaction aborted'));
      const store=transaction.objectStore(STORE_NAME);
      for (const id of fileIds) store.delete(id);
    });
  }

  async clear() {
    await this.ensureInitialized()
    if (this.sessionFiles) { this.sessionFiles.clear(); return; }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => {
        this.updateStorageEstimate()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  async updateFileFavorite(fileId, favorite) {
    await this.ensureInitialized()
    if (this.sessionFiles) {
      const file = this.sessionFiles.get(fileId);
      if (!file) throw new Error('File not found');
      const updated = { ...file, favorite }; this.sessionFiles.set(fileId, updated); return updated;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      let updated;
      transaction.oncomplete = () => resolve(updated);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      // First get the file
      const getRequest = store.get(fileId)

      getRequest.onsuccess = () => {
        const fileObj = getRequest.result
        if (!fileObj) {
          reject(new Error('File not found'))
          return
        }

        // Update the favorite flag
        fileObj.favorite = favorite

        // Put the updated object back
        const putRequest = store.put(fileObj)

        putRequest.onsuccess = () => {
          updated = fileObj
        }

        putRequest.onerror = () => {
          reject(putRequest.error)
        }
      }

      getRequest.onerror = () => {
        reject(getRequest.error)
      }
    })
  }
}

export const storage = new StorageService()
