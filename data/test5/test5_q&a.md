### Q1. What module should be imported to use the promise-based filesystem APIs in Node.js?  
**A:** `node:fs/promises`.  
> *“To use the promise-based APIs: import * as fs from 'node:fs/promises';”*  

---

### Q2. In callback-based fs APIs, what is always the first argument passed to the callback?  
**A:** An exception object (or `null`/`undefined` if no error occurred).  
> *“The arguments passed to the completion callback depend on the method, but the first argument is always reserved for an exception.”*  

---

### Q3. What happens if a FileHandle is not explicitly closed?  
**A:** Node.js will try to close it automatically and emit a process warning, but this is unreliable.  
> *“If a {FileHandle} is not closed using the `filehandle.close()` method, it will try to automatically close … but it can be unreliable … always explicitly close {FileHandle}s.”*  

---

### Q4. What does the `filehandle.chmod(mode)` method do?  
**A:** It modifies the permissions on the file.  
> *“Modifies the permissions on the file. See chmod(2).”*  

---

### Q5. What is returned when `filehandle.read(buffer, offset, length, position)` is successful?  
**A:** An object with `bytesRead` and `buffer` properties.  
> *“Returns: {Promise} Fulfills upon success with an object with two properties: bytesRead … buffer …”*  

---

### Q6. Which option in `filehandle.createReadStream()` controls the number of bytes read into memory at once, and what is its default?  
**A:** `highWaterMark`, default `64 * 1024`.  
> *“`highWaterMark` {integer} **Default:** `64 * 1024`”*  

---

### Q7. Can fsPromises.access() safely be used to check a file before opening it?  
**A:** No, it introduces a race condition.  
> *“Using `fsPromises.access()` to check for the accessibility of a file before calling `fsPromises.open()` is not recommended. Doing so introduces a race condition …”*  

---

### Q8. What happens if `fsPromises.copyFile()` is used with `fs.constants.COPYFILE_EXCL` and the destination exists?  
**A:** The operation fails.  
> *“`fs.constants.COPYFILE_EXCL`: The copy operation will fail if `dest` already exists.”*  

---

### Q9. What does `fsPromises.glob(pattern[, options])` return?  
**A:** An AsyncIterator yielding matching file paths.  
> *“Returns: {AsyncIterator} An AsyncIterator that yields the paths of files that match the pattern.”*  

---

### Q10. What does the `fsPromises.symlink(target, path[, type])` method do?  
**A:** Creates a symbolic link.  
> *“Creates a symbolic link.”*  

---

### Q11. Does Node.js provide built-in encryption support for fs operations?  
**A:** No data about it in the text.  

---

### Q12. Does fsPromises API guarantee thread safety when multiple concurrent modifications occur on the same file?  
**A:** No, operations are not threadsafe.  
> *“These operations are not synchronized or threadsafe. Care must be taken when performing multiple concurrent modifications on the same file …”*  
