const Memcached = require("memcached");
const memcached = new Memcached("localhost:11211");
const fs = require('fs');
const express = require("express");

const app = express();


app.get("/status", (req , res) =>{
  res.send("API is working...");
});

app.post("/data/:id", (req, res) => {
  // Array for holding individual chunks of data in data stream
  let arr = [];

  // id that will be used to save the data in memcached library
  let id = req.params.id;

  // event listener for incoming data
  req.on("data", (chunk) => {
    // add chunk to array
    arr.push(chunk);

    console.log(`Number of chunks in byte stream: ${arr.length}`);
  });

  // event listener for end of data processing
  req.on("end", async () => {
    console.log("all chunks came through");

    // make sure file size does not exceed 50MiB.
    if (Buffer.concat(arr).byteLength > 52428800) {
      console.log(`File size exceeds 50 MB. Terminating process`);
      res.status(403).send({status: 'Cannot upload files larger than 50MiB in size.'});
      return;
    };


    // add identifier that keeps track of number of chunks a particular data stream has.
    await memcached.set(`${id}`, arr.length, 60, (err) => {
      console.log('Just added data identifier for id:' + id);
    });

    // cycle through array containing individual chunks of data and add them to memecached library separately.
    for (let chunk of arr) {
      await memcached.set(`${id}-${arr.indexOf(chunk)}`, chunk, 60, (error) => {
        if (error) {
          console.error(error)
        } else {
          console.log(`Just added chunk in position ${arr.indexOf(chunk)} to memecached lib.`);
        }
      });
    }

    // send response to client side.
    res.send({status: 'success!!', key: `${id}`});
  })
});

app.get("/data/:id", async (req, res) => {
  let id = req.params.id;
  
  // check if data with id specified in request has been cached before
  memcached.get(id, (error, data) => {
    if (error) {
      res.status(500).send({status: 'failed'});
      return;
    }

    // If there is no data matching the id found in memcached library, send a response to client-side.
    if (!data) {
      console.log(data);
      res.send({status: 'No data matching this id was found in cache library', data: data, check: 'pooo'});
    }
    else {
      // array holding the keys for all the chunks of our desired data.
      let keys = [];

      // get number of data chunks to be retrieved
      let numberOfChunks = parseInt(data);

      // populate array holding the keys for all the chunks of our desired data.
      for (let index = 0; index < numberOfChunks; index++ ) {
        keys.push(`${id}-${index}`);
      }

      // array that will hold all chunks retrieved from memcached library.
      let final = [];

      // populate array holding all chunks
      memcached.getMulti(keys, (error, objects) => {
        for (let index = 0; index < numberOfChunks; index++) {
          final.push(objects[`${id}-${index}`])
        }

        // check if the correct number of chunks were retrieved.
        // if an incorrect number of chunks were retrieved, it means that the file is corrupt. 
        if (final.length !== numberOfChunks) {
          res.status(502).send({status: 'File corrupted'});
        } 
        else {
          // Combine all the chunks together to create complete Buffer object.
          final = Buffer.concat(final);

          // Send Buffer object to client-side.
          res.write(final, () => 
            console.log('writing some data to stream')
          )
        }
      })
    }
  });
})


app.listen (8888, err =>{
  if(err){
    console.log("error - server cannot connect"); return}
    console.log ("server listening on port 8888...")
})


