var express = require('express');
var app = require('express')();
var http = require('http').Server(app);
var port = process.env.PORT || 4000;
var request = require("request")
var fs = require('fs');
var CronJob = require('cron').CronJob;
var haversine = require('haversine');

var uBikeObj;
var uBikeUrl = "http://data.taipei/youbike";

const uBikeResNum = 2;


fs.readFile('./uBike.json', 'utf8', function (err, data) {
    if (err) throw err;
    uBikeObj = JSON.parse(data);
    console.log("json first read done");
});

//update uBike json per minute
new CronJob('*/1 * * * *', function() {

    var r = request(uBikeUrl);
    r.on('response',  function (res) {
        console.log('retrieve response');
        res.pipe(fs.createWriteStream('./uBike.gz'));
    });

    r.on("error", function(e) {
        console.log("Got error: " + e.message);
    });

    r.on('end', function(){
        console.log('request finished, downloading file');
        var zlib = require('zlib');
        var unzip = zlib.createUnzip();
        var inp = fs.createReadStream('./uBike.gz');
        var out = fs.createWriteStream('./uBike.json');
        inp.pipe(unzip).pipe(out);
        inp.on('close', function () {
            console.log("decompress done");
            fs.readFile('./uBike.json', 'utf8', function (err, data) {
            if (err) throw err;
            uBikeObj = JSON.parse(data);
            });
        });
    });

}, null, true);

//get client addr
var geocodeReqStr = "http://maps.googleapis.com/maps/api/geocode/json?language=en&latlng=";

app.get('/v1/ubike-station/taipei', function(req, res){
    console.log('client ask for UBike station');

    var clientJson = {
        code: -3,
        result:[]
    }

    if(req.query.lat && req.query.lng){
        console.log('arg valid');
        //check in taipei or not
        var clientReq = geocodeReqStr + req.query.lat + ',' + req.query.lng;
        request(clientReq, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var clientAddr = JSON.parse(body);
                if(clientAddr.results[1].formatted_address.search("Taipei City")==-1){
                    console.log('not in Taipei City');
                    //send code -2
                    clientJson.code = -2;
                    res.send(clientJson);
                }
                else{
                    console.log('caculate station distance');

                    var start = {
                        latitude: req.query.lat,
                        longitude: req.query.lng
                    }
                    var arr = [];

                    for(var k in uBikeObj.retVal){
                        var end = {
                            latitude: uBikeObj.retVal[k].lat, 
                            longitude: uBikeObj.retVal[k].lng
                        }
                        arr.push({
                            sna: uBikeObj.retVal[k].sna,
                            dis: haversine(start, end),
                            sbi: uBikeObj.retVal[k].sbi
                        });
                    }
                    // sort by dis
                    arr = arr.sort(function (a, b) {
                        return a.dis > b.dis ? 1 : -1;
                    });

                    var outputNum=0;

                    while(outputNum != uBikeResNum){
                        clientJson.result.push({
                            station: arr[outputNum].sna,
                            num_ubike: arr[outputNum].sbi,
                            lat: arr[outputNum].lat,
                            lng: arr[outputNum].lng,
                            mday:arr[outputNum].mday
                        });
                        outputNum++;
                    }


                    //check 2 sbi all 0 or not
                    if(clientJson.result[0].num_ubike==0 && clientJson.result[1].num_ubike==0 ){
                        clientJson.code = 1;
                        clientJson.result = [];
                        res.send(clientJson);
                    }
                    else{
                        clientJson.code = 0;
                        res.send(clientJson);
                    }
                    
                }         
            }
            else {
                // The request failed, handle it
            }
        });
    }
    else{
        console.log('arg err');
        //send code -1
        clientJson.code = -1;
        res.send(clientJson);
    }


    
    //for(var k in uBikeObj.retVal){
        //console.log(uBikeObj.retVal[k].sna);
        //console.log("---------------------");
    //}
});

http.listen(port, function(){
  console.log('listening on *:'+ port);
});