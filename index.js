var Horseman = require('node-horseman');
var _ = require('lodash');
var Promise = require("bluebird");
var debug = require('debug')('linkedin');
var config = require('./config')


Horseman.registerAction('clickSelector', function(selector,action) {

  var self = this;
  var action = action || ''
  return this.exists(selector)
  			 .then(function(exists){
  			 	if(exists) 
  			 		return self.log("Click: " + action)
				            .text(selector)
				            .then(function(text){
				            	console.log(text.trim())
				            })
				            //.log()
				            .click(selector)
				else
					return self.log("Button is not ready")
  			 })

            
});

Horseman.registerAction('resize', function() {

  var self = this;
  return self.evaluate( function getSelectorSize(selector){
      return {
        height : $( selector ).height(),
        width : $( selector ).width()
      }
    }, 'html')
  .then(function(size){
    debug(size);
    return self.viewport(size.height,size.width)
  });
            
});

Horseman.registerAction('waitForEither', function(selector,selector2) {

  var self = this;
  return self.waitFor(function waitForOneofSelector(selector,selector2) {

		return  ( $(selector).length  >=1 || $(selector2).length  >=1   )

	}, selector,selector2,true)
            
});


Horseman.registerAction('mouseDown', function(selector) {

  var self = this;
  return self.evaluate(function fireEvent(selector){
    	console.log('Click:' + $(selector).text().trim())
    	element = jQuery(selector);
		event = document.createEvent('MouseEvent');
		event.initEvent('mousedown', true, true);
		element.get(0).dispatchEvent(event);
    },selector)
            
});

Horseman.registerAction('filterByInput', function(buttonselector,inputselector,inputText) {

  var self = this;
  return self.waitForEither(buttonselector,inputselector)
    .clickSelector(buttonselector)
    .waitForSelector(inputselector)
    .click(inputselector)
    .type(inputselector,inputText)
    .waitForSelector('li.type-ahead-result.location.region')
    .mouseDown('.type-ahead-result:eq(0)')
            
});


Horseman.registerAction('waitForSearchTotal', function(selector) {

  var self = this;
  return self.waitForNextPage()
    .exists(selector)
    .then(function(exists){
    	if(exists)
    		return self.evaluate(function getSearchTotal(selector){
		    	return $(selector).text().trim().replace(/ +/gm,' ').replace(/\n /gm,'\n')
		    },selector)
		    .then(function(results){
		    	console.log(results)
		    })
		else return Promise.reject({NoMoreRecords:true })
    })


});

Horseman.registerAction('search', function(selector,inputText) {

  var self = this;
  return self.waitForSelector(selector)
    .type(selector,inputText)
    .keyboardEvent('keypress',16777221)
    
});

Horseman.registerAction('waitForFullyLoaded', function(selector,totalselector) {

  var self = this;
  return self.waitForSearchTotal(totalselector)
    .resize()
    .resize()
	.waitFor(function waitForNumberofSelector(selector,totalSelector) {
		var totaltext = $(totalSelector).text().trim().replace(/,/g,'').match(/\d+/)
		var page = parseInt($('li.active').text().trim())-1
		console.log('page:',page)
		console.log('totaltext',totaltext)
		totaltext.length > 0 ? totaltext = totaltext[0] : '10'
		var total = parseInt(totaltext)
		console.log('total',total)
		console.log(selector,$(selector).length )
		var rest = total - page*10
		console.log('rest',rest)
		var limit = 10
		rest > 10 ? limit = 10 : limit = rest
		console.log('limit',limit)
		return  ( $(selector).length  === limit )

	}, selector,totalselector,true)

});


    




var horseman = new Horseman({
  timeout: 100000,
  ignoreSSLErrors:true,
  bluebirdDebug:true ,
  diskCache: true,
  diskCachePath: './',
  cookiesFile:'horseman.cookie',
  phantomOptions:{
  debug : true
  },
  });

var skipResourcesList = [
'perf.linkedin.com',
'sb.scorecardresearch.com',
]

horseman.on('resourceError',function(err)  {
      if(!_.isEmpty(err)) console.log('resourceError',err);
});

horseman.on('ResourceRequested',function(requestData, networkRequest){
   
   var regex = new RegExp(skipResourcesList.join('|'),'i');

   if (requestData.url.match(regex) != null){
      debug('Aborting networkRequest....',requestData)
      return
   }
})

horseman.on('consoleMessage', function( msg ){
    debug('phantomJS console message:',msg);
})
// horseman.on('urlChanged',function(url){
// 	console.log("new:",url)
// })

horseman.on('error',function(msg,trace){
	console.log("msg:",msg)
})

function login(){

	return horseman.exists('input#login-email')
			.then(function(exists){
				if(exists)
					return horseman.type('input#login-email',config.username)
						   .screenshot('username.png')
						   .type('input#login-password',config.password)
						   .screenshot('password.png')
						   .waitForSelector('input#login-submit')
						   .resize()
						   .clickSelector('input#login-submit','Sign In')
						   .log("Logging in, could take a while,please wait....")
						   .waitForEither('button.nav-search-button','input[placeholder="Search"]')
						   .screenshot('login.png')
			})
				  
}

function GetPage(debug){
	return horseman
    		.waitForFullyLoaded('span.actor-name','.search-results__total')
    		.then(function(){
				return horseman.evaluate(function GetPageNumber(selector){
					return $(selector).text().trim()
				},'li.active')

			})
			.then(function(number){
				console.log("Opening Page: " + number)
				if(debug) return horseman.screenshot(_.padStart(number,3,0)+ '.png')
			})
			.evaluate(function(selector){

				var results = $(selector).map(function parsePeople(index,element){

					return{
						name: $('span.actor-name').eq(index).text(),
						title: $('p.subline-level-1').eq(index).text(),
						location: $('p.subline-level-2').eq(index).text().trim(),
						current: $('p.search-result__snippets').eq(index).text().trim().replace(/Current:\n/g,'')
					}
				})
				return results.get()

			},'span.actor-name')
			.then(function(results){

				console.log(results)
				console.log('-'.repeat(80))
				return results
			})
			.exists('button.next')
			.then(function(exists){
				if(exists) return horseman
								  .wait(_.random(500,1500))
								  .clickSelector('button.next')
								  .then(function(){ return GetPage() })
			})
}


function LinkedInScrape(query,location,debug)
{
	horseman.userAgent('Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:47.0) Gecko/20100101 Firefox/47.0')
	    .open("http://www.linkedin.com")
	    .html('title')
	    .log()
	    .waitForEither('input#login-email','input[placeholder="Search"]')
	    .screenshot('begin.png')
	    .then(function(){ return login() })
		.search('input[placeholder="Search"]',query)
		.then(function(){
			if(location)
			return horseman.filterByInput('button#sf-facetGeoRegion-add','input[placeholder="Type a location name"]',location)
		})
	    .then(function(){ return GetPage(debug) })
	    .screenshot('end.png')
	    .catch({NoMoreRecords:true },function(){
	    	console.log("It looks link there is no more records returned, open 'nomore.png' to confirm.")
	    	return horseman.screenshot('nomore.png')
	    })
	    .catch(e=>{
	    	console.log(e)
	    	return horseman.screenshot("error.png")
	    })
	    .log("Done")
	    .close()
}

var argv = require('minimist')(process.argv.slice(2),{
  string:['search','location'],
  boolean:['debug'],
  alias:{search:'s',location:'l',debug:'d'},

  unknown : function(param){ console.log("unknown parameter:" + param);process.exit();}
});

debug(argv)

if(argv.s && !_.isEmpty(config.username) && !_.isEmpty(config.password)){

	LinkedInScrape(argv.s,argv.l,argv.d)

}else if(_.isEmpty(config.username) || _.isEmpty(config.password)){
	horseman.close()
	console.log("You must supply username and password in 'config.js'")
}
else{
	horseman.close()
	console.log("You must provide query string")
}