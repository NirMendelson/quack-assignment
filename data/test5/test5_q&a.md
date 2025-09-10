### Q1. What does the `node:fs` module enable?  
**A:** Interacting with the file system in a way modeled on standard POSIX functions.  
> *“The `node:fs` module enables interacting with the file system in a way modeled on standard POSIX functions.”*  

---

### Q2. How can you import the promise-based APIs of the `fs` module using CommonJS?  
**A:** By using `const fs = require('node:fs/promises');`.  
> *“const fs = require('node:fs/promises');”*  

---

### Q3. What is the first argument always reserved for in a callback-based API?  
**A:** An exception.  
> *“The first argument is always reserved for an exception.”*  

---

### Q4. What happens if a `FileHandle` is not explicitly closed?  
**A:** It tries to automatically close the file descriptor and emit a process warning, but this behavior is unreliable.  
> *“If a {FileHandle} is not closed... it will try to automatically close the file descriptor and emit a process warning... Please do not rely on this behavior because it can be unreliable.”*  

---

### Q5. What does `filehandle.chmod(mode)` do?  
**A:** It modifies the permissions on the file.  
> *“Modifies the permissions on the file. See chmod(2).”*  

### Q6. What does the `autoClose` option do in `readableWebStream`?  
**A:** When set to true, it causes the {FileHandle} to be closed when the stream is closed.  
> *“`autoClose` {boolean} When true, causes the {FileHandle} to be closed when the stream is closed.”*  

---

### Q7. What will happen if `readableWebStream()` is called more than once on the same FileHandle?  
**A:** An error will be thrown.  
> *“An error will be thrown if this method is called more than once or is called after the `FileHandle` is closed or closing.”*  

---

### Q8. What does `filehandle.readFile(options)` return if no encoding is specified?  
**A:** It returns a {Buffer} object.  
> *“If no encoding is specified (using `options.encoding`), the data is returned as a {Buffer} object.”*  

---

### Q9. What does the `filehandle.truncate(len)` method do if the file was larger than `len` bytes?  
**A:** It retains only the first `len` bytes in the file.  
> *“If the file was larger than `len` bytes, only the first `len` bytes will be retained in the file.”*  

---

### Q10. What does the `fsPromises.copyFile(src, dest[, mode])` function do?  
**A:** It asynchronously copies `src` to `dest`, overwriting `dest` if it already exists by default.  
> *“Asynchronously copies `src` to `dest`. By default, `dest` is overwritten if it already exists.”*  

### Q11. What happens when using `constants.COPYFILE_EXCL` with `fsPromises.copyFile` if the destination exists?  
**A:** The copy operation fails.  
> *“By using COPYFILE_EXCL, the operation will fail if destination.txt exists.”*  

---

### Q12. What does the `recursive` option in `fsPromises.cp` control, and what is its default?  
**A:** It controls copying directories recursively, and the default is `false`.  
> *“`recursive` {boolean} copy directories recursively **Default:** `false`”*  

---

### Q13. Does `fsPromises.glob` support negation patterns in the `exclude` option?  
**A:** No, negation patterns are not supported.  
> *“Note: Negation patterns (e.g., '!foo.js') are not supported.”*  

---

### Q14. How does `fsPromises.lstat` differ from `fsPromises.stat` regarding symbolic links?  
**A:** `lstat` stats the link itself, not the target file.  
> *“Equivalent to `fsPromises.stat()` unless `path` refers to a symbolic link, in which case the link itself is stat-ed, not the file that it refers to.”*  

---

### Q15. What does `fsPromises.mkdtempDisposable` return, and what happens on disposal?  
**A:** It returns an async-disposable object with `path`, `remove()`, and `[Symbol.asyncDispose]`; disposing removes the directory and its contents asynchronously.  
> *“Fulfills with a Promise for an async-disposable Object: `path`… `remove`… `[Symbol.asyncDispose]`… When the object is disposed, the directory and its contents will be removed asynchronously if it still exists.”*  

---

### Q16. What happens if an ongoing `readFile` is aborted using an `AbortSignal`?  
**A:** The promise is rejected with an `AbortError`.  
> *“If a request is aborted the promise returned is rejected with an `AbortError`.”*  

---

### Q17. Does aborting `fs.readFile` cancel the underlying OS read operations?  
**A:** No. It only stops the internal buffering that `fs.readFile` performs.  
> *“Aborting an ongoing request does not abort individual operating system requests but rather the internal buffering `fs.readFile` performs.”*  

---

### Q18. What does `fsPromises.readlink` resolve to on success?  
**A:** The symbolic link’s target as a `linkString`.  
> *“Fulfills with the `linkString` upon success.”*  

---

### Q19. What special condition applies to `fsPromises.realpath` on Linux with musl libc?  
**A:** The procfs must be mounted on `/proc`.  
> *“On Linux, when Node.js is linked against musl libc, the procfs file system must be mounted on `/proc` in order for this function to work.”*  

---

### Q20. How do you get `rm -rf` behavior in Node.js?  
**A:** Use `fsPromises.rm()` with `{ recursive: true, force: true }`.  
> *“To get a behavior similar to the `rm -rf` Unix command, use `fsPromises.rm()` with options `{ recursive: true, force: true }`.”*  

### Q21. Why is it not recommended to call `fs.access()` before `fs.open()`, `fs.readFile()`, or `fs.writeFile()`?  
**A:** It introduces a race condition because the file’s state can change between calls.  
> *“Doing so introduces a race condition, since other processes may change the file's state between the two calls.”*  

---

### Q22. Which flag should you use with `open()` to create a file only if it does not already exist?  
**A:** Use the `'wx'` flag.  
> *“open('myfile', 'wx', (err, fd) => { … })”*  

---

### Q23. Why can `fs.access()` be misleading on Windows with directories protected by ACLs?  
**A:** It does not check the ACL and may report a path as accessible even when it is not.  
> *“The `fs.access()` function, however, does not check the ACL and therefore may report that a path is accessible even if the ACL restricts the user from reading or writing to it.”*  

---

### Q24. What is the default file system flag used by `fs.appendFile`?  
**A:** `'a'` (append).  
> *“`flag` {string} … **Default:** `'a'`.”*  

---

### Q25. What is unusual about the `fs.exists()` callback and why is `fs.exists()` deprecated?  
**A:** The callback takes only a boolean and not an error-first parameter, and the API is deprecated in favor of `fs.stat()` or `fs.access()`.  
> *“**The parameters for this callback are not consistent with other Node.js callbacks.** … The `fs.exists()` callback has only one boolean parameter.”*  
> *“Deprecated: Use `fs.stat()` or `fs.access()` instead.”*  

### Q26. What does `fs.fsync(fd, callback)` request, and what does the callback receive on success?  
**A:** It requests that all data for the open file descriptor be flushed to the storage device; the callback receives no arguments other than a possible exception.  
> *“Request that all data for the open file descriptor is flushed to the storage device… No arguments other than a possible exception are given to the completion callback.”*  

---

### Q27. What happens when `fs.ftruncate(fd, len, callback)` is called if the file is larger than `len`?  
**A:** Only the first `len` bytes are retained.  
> *“If the file referred to by the file descriptor was larger than `len` bytes, only the first `len` bytes will be retained in the file.”*  

---

### Q28. Which value types are accepted for `atime` and `mtime` in `fs.futimes`?  
**A:** `number`, `string`, or `Date`.  
> *“`atime` {number|string|Date} … `mtime` {number|string|Date}”*  

---

### Q29. What does `fs.glob(pattern[, options], callback)` return through the callback?  
**A:** The list of files that match the pattern.  
> *“Retrieves the files matching the specified pattern.”*  

---

### Q30. What is the stability status of `fs.lchmod`, and where is it implemented?  
**A:** It is deprecated and only implemented on macOS.  
> *“Stability: 0 - Deprecated… This method is only implemented on macOS.”*  

### Q31. What does `fs.readlink(path[, options], callback)` return in the callback, and how do you get it as a Buffer?  
**A:** It returns `(err, linkString)`. Pass `options` with `encoding: 'buffer'` (or `'buffer'` as the options string) to receive a `Buffer` instead of a string.

---

### Q32. With `fs.readv(fd, buffers[, position], callback)`, what do `bytesRead` and `buffers` in the callback represent, and when is the current file position used?  
**A:** `bytesRead` is the number of bytes read; `buffers` is the same array you provided, now filled with data. If `position` is not a number, reading starts from the current file position.

---

### Q33. What does `fs.realpath(path[, options], callback)` do, and what special Linux requirement exists for `fs.realpath.native` on musl systems?  
**A:** `fs.realpath` resolves a canonical pathname by handling `.`, `..`, and symlinks. For `fs.realpath.native` on Linux linked against musl, `/proc` must be mounted for it to work.

---

### Q34. How does `fs.rename(oldPath, newPath, callback)` behave if `newPath` already exists or is a directory?  
**A:** If a file exists at `newPath`, it will be overwritten; if a directory exists at `newPath`, an error is thrown.

---

### Q35. When should you prefer `fs.rm()` over `fs.rmdir()`, and which options make it behave like `rm -rf`?  
**A:** Use `fs.rm()` for removals, especially recursive ones (since `fs.rmdir()`’s recursive option is deprecated/removed). Use `{ recursive: true, force: true }` to mimic `rm -rf`.

### Q36. In `fs.write(fd, string[, position[, encoding]], callback)`, what happens if `string` isn’t actually a string, and how is the write position chosen?
**A:** A non-string `string` throws an exception. Data is written at `position` (offset from start); if `position` isn’t a number, it writes at the current file position.

---

### Q37. Why might non-ASCII text written to `stdout` look wrong on Windows, and how can you fix it?
**A:** The console’s default codepage won’t render UTF-8 properly. Run `chcp 65001` to switch to UTF-8 so characters render correctly.

---

### Q38. What does the `flush` option do in `fs.writeFile(...)`, and can a write be aborted?
**A:** If `flush: true` and the write succeeds, Node calls `fs.fsync()` to flush data to storage. You can pass an `AbortSignal` to cancel, but cancellation is best-effort and some data may still be written.

---

### Q39. How does using a **file descriptor** with `fs.writeFile()` differ from passing a **filename**?
**A:** With a descriptor, the file is **not replaced**; data is written at the descriptor’s current position, so original data may remain before/after. With a filename, the file’s contents are **replaced**. Also, `writeFile()` auto-retries partial writes; `fs.write()` may require manual retries.

---

### Q40. What does `fs.existsSync(path)` return, and how does it relate to `fs.exists()`?
**A:** It returns a boolean (`true` if the path exists). `fs.exists()` (async) is deprecated due to its odd callback signature, but `fs.existsSync()` is **not** deprecated and has no callback.

### Q41. What does `fs.opendirSync(path, options)` return, and what does `bufferSize` control?  
**A:** It returns an `fs.Dir` object; `bufferSize` controls how many directory entries are buffered internally.  
> *“Synchronously open a directory… Creates an {fs.Dir}, which contains all further functions for reading from and cleaning up the directory… `bufferSize` {number} Number of directory entries that are buffered internally when reading from the directory.”*  

---

### Q42. How do `fs.readdirSync` options affect results for filenames and types?  
**A:** `encoding` sets return type (string/Buffer), `withFileTypes: true` returns `fs.Dirent` objects, and `recursive: true` lists all nested entries.  
> *“The optional `options` argument can be a string specifying an encoding… If the `encoding` is set to `'buffer'`, the filenames returned will be passed as {Buffer} objects. If `options.withFileTypes` is set to `true`, the result will contain {fs.Dirent} objects… If `true`, reads the contents of a directory recursively.”*  

---

### Q43. When would you prefer `fs.realpathSync.native()` and what Linux caveat exists?  
**A:** Use it for native `realpath(3)` behavior; on Linux with musl libc, `/proc` must be mounted.  
> *“Synchronous realpath(3)… On Linux, when Node.js is linked against musl libc, the procfs file system must be mounted on `/proc` in order for this function to work. Glibc does not have this restriction.”*  

---

### Q44. What’s the current status of `fs.rmdirSync(..., { recursive })`, and what should you use instead?  
**A:** The `recursive` option is deprecated/removed; use `fs.rmSync(path, { recursive: true, force: true })`.  
> *“The `recursive` option is deprecated, use `fs.rmSync` instead… To get a behavior similar to the `rm -rf` Unix command, use [`fs.rmSync()`][] with options `{ recursive: true, force: true }`.”*  

---

### Q45. In `fs.watch()`, what might the `filename` type be, and what do `watcher.ref()` / `watcher.unref()` do?  
**A:** `filename` can be UTF-8 string or Buffer; `ref()` keeps the event loop alive, `unref()` allows it to exit.  
> *“If `filename` is provided, it will be provided as a {Buffer} if `fs.watch()` is called with its `encoding` option set to `'buffer'`, otherwise `filename` will be a UTF-8 string.”*  
> *“When called, requests that the Node.js event loop not exit so long as the {fs.FSWatcher} is active… When called, the active {fs.FSWatcher} object will not require the Node.js event loop to remain active.”*  

### Q46. What object does `fs.watchFile()` return on success?  
**A:** An `fs.StatWatcher` instance.  
> *“A successful call to `fs.watchFile()` method will return a new {fs.StatWatcher} object.”*  

---

### Q47. What do `watcher.ref()` and `watcher.unref()` do on an `fs.StatWatcher`?  
**A:** `ref()` keeps the event loop alive while the watcher is active; `unref()` allows the process to exit if nothing else is pending.  
> *“Requests that the Node.js event loop not exit so long as the {fs.StatWatcher} is active.”*  
> *“The active {fs.StatWatcher} object will not require the Node.js event loop to remain active… the process may exit…”*  

---

### Q48. When does a `fs.ReadStream` emit `'ready'`?  
**A:** When it’s ready to use—immediately after `'open'`.  
> *“Emitted when the {fs.ReadStream} is ready to be used. Fires immediately after `'open'`.”*  

---

### Q49. What does `readStream.pending` indicate?  
**A:** That the underlying file hasn’t been opened yet (before `'ready'`).  
> *“This property is `true` if the underlying file has not been opened yet, i.e. before the `'ready'` event is emitted.”*  

---

### Q50. What changes when `bigint: true` is used with `fs.stat`/`lstat`/`fstat`?  
**A:** Numeric fields become `bigint` and extra `*Ns` nanosecond properties appear.  
> *“If `bigint` in the `options` … is true, the numeric values will be `bigint` instead of `number`, and the object will contain additional nanosecond-precision properties suffixed with `Ns`.”*  

---
