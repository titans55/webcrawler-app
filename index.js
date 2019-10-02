var express = require('express');
var app = express();

// core modules
var fs = require('fs');
var url = require('url');

// third party modules
var _ = require('lodash');
var async = require('async');
var cheerio = require('cheerio');
var request = require('request');

//global variables
websocket = null
var crawled = [];
var inboundLinks = [];
var linksContainsKeyword = []

var OPTIONS = {
    keyword: "IoT",
    base: "chevron.com"
}

var base = OPTIONS.base; 
var firstLink = 'https://www.'+ base;


var makeRequest = function(crawlUrl, callback){
  var startTime = new Date().getTime();
  request(crawlUrl, function (error, response, body) {

    var pageObject = {};
    pageObject.links = [];

    var endTime = new Date().getTime();
    var requestTime = endTime - startTime;
    pageObject.requestTime = requestTime;

    if(body){
        var $ = cheerio.load(body);
        pageObject.title = $('title').text();
        pageObject.url = crawlUrl;
        

        msg = {
            "type": "current_crawled_url",
            "url": crawlUrl 
        }

        if($("body:contains('"+OPTIONS.keyword+"')").length > 0){
            linksContainsKeyword.push(pageObject)
            if(linksContainsKeyword.length == 1){  
                msg['type'] =  "first_page_with_keyword"   
                msg['html'] =  $("body").html()
                msg['keyword'] = OPTIONS.keyword
            }
        }  
        websocket.send(JSON.stringify(msg))


        $('a').each(function(i, elem){
            pageObject.links.push({linkText: $(elem).text(), linkUrl: elem.attribs.href})
        });
    }
    callback(error, pageObject);
  });
}

var myLoop = function(link){
    makeRequest(link, function(error, pageObject){
        crawled.push(pageObject.url);
        async.eachSeries(pageObject.links, function(item, cb){
            if(item.linkUrl){
                parsedUrl = url.parse(item.linkUrl);
                
                if(item.linkUrl[0]!=='#' && !item.linkUrl.endsWith(".pdf") && !item.linkUrl.includes("/documents/") && !item.linkUrl.includes("javascript:void(0)") && !item.linkUrl.includes("mailto:") && !item.linkUrl.includes("/media/")){
                    if(parsedUrl.hostname == null && !item.linkUrl.includes("https")){
                        parsedUrl.hostname = base
                        item.linkUrl = "https://www." + base + item.linkUrl
                    }   
                    // check if the url actually points to the same domain
                    if(parsedUrl.hostname == base){
                        inboundLinks.push(item.linkUrl);
                    }
                }
            }
            cb();
        }
        ,function(){
            const nextLink = _.difference(_.uniq(inboundLinks), crawled);
            if(nextLink.length > 0 && linksContainsKeyword.length<10){
                myLoop(nextLink[0]);
            }
            else {
                console.log('done!');
                msg = {
                    "type" : "crawling_ended",
                    "crawlingReport": "Crawling Report: Found "+linksContainsKeyword.length+" URL(s) that contains '"+OPTIONS.keyword+"'"
                }
                websocket.send(JSON.stringify(msg))
            }
        });
    });
}


app.get('/', function (req, res) {
    crawled = [];
    inboundLinks = [];
    linksContainsKeyword = []
    res.sendFile(__dirname + '/index.html');
})


var WebSocketServer = require('ws').Server,
    wss = new WebSocketServer({port: 40510})
    wss.on('connection', function (ws) {
        websocket = ws
        ws.on('message', function (message) {
            console.log('received: %s', message)
            myLoop(firstLink);
        });
    })

var server = app.listen(8081, function () {
    var port = server.address().port
    
    console.log("Webcrawler app listening at %s:%s", "localhost", port)
})
