import express from 'express';
var bodyParser 		= require('body-parser');
var cookieParser 	= require('cookie-parser');
var session      	= require('express-session');
var mongoose 		= require('mongoose');
var MongoStore 		= require('connect-mongo')(session);
const app 			= express();

//Utilities
function def(x) {
	return typeof x !== 'undefined';
}

function err(error) {
	if (error.constructor === Error) {
		return error;
	}else {
		var data = error.data;
		if (def(data)) {
			var error1 = geterr(data);
			if (def(error1)) {
				return error1
			}else {
				try {
					var parsedData = JSON.parse(data);
				} catch(error2) {
					return err(data.toString());
				}
				var parsedError = geterr(parsedData);
				if (def(parsedError)) {
					return parsedError;
				}else {
					return err(data.toString());
				}
			}
		}else if (def(error.message)) {
			return Error(error.message.toString());
		}else {
			return Error(error.toString());
		}
	}
}

function errstr(error) {
	return err(error).message;
}

function errdict(error) {
	return {error:errstr(error)};
}

function geterr(data) {
	var str = (def(data.errors) && data.errors.length > 0) ? data.errors[0] : data.error;
	if (def(str) && def(str.message)) {
		str = str.message;
	}
	return !def(str) ? undefined : err(str);
}

//Time constants
var ONE_MINUTE = 1000*60;
var TWO_MINUTES = ONE_MINUTE*2;
var HALF_HOUR = ONE_MINUTE*30;
var ONE_HOUR = ONE_MINUTE*60;
var ONE_DAY = ONE_HOUR*24;
var ONE_WEEK = ONE_DAY*7;
var TWO_WEEKS = ONE_WEEK*2;
var ONE_YEAR = ONE_DAY*365;

//Database+Session
console.log("Connecting to database: "+process.env.MONGOLAB_URI);
mongoose.connect(process.env.MONGOLAB_URI, function(error) {
	if (error) {
		console.log("Error connecting to Mongo:");
		console.log(error);
	}
});
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({
    cookie: { maxAge: ONE_YEAR } ,
    secret: "uy7gn7gn78g7" ,
    resave: true,
    saveUninitialized: true,
    store:new MongoStore({
    	mongooseConnection: mongoose.connection,
        collection: 'session', 
        auto_reconnect:true
    })
}));

//Babel+Webpack
app.use('/', express.static('public'));

//Twitter
var TwitterAPI = require('node-twitter-api');
var twitter = new TwitterAPI({
    consumerKey: 'gx3LcGvSXR4EUerGm1RKaRJnI',
    consumerSecret: 'CP8nVMHJG51Iyy93jQewJfogAMeoeayDIwFAcc78OPKdL5El8z',
    callback: 'http://localhost:8080/twitter_callback'
});

//api/twitter/auth_info
app.get('/api/twitter/auth_info', function (req, res) {
	var loggedInError = Error("Generic error");
	(new Promise(function(resolve,reject) {
		if (!def(req.session.twitter)) {
			reject(loggedInError);
		}else {
			var accessToken = req.session.twitter.accessToken;
			var accessTokenSecret = req.session.twitter.accessTokenSecret;
			var time = req.session.twitter.time;
			var screenName = req.session.twitter.screenName;
			if (!def(accessToken) || !def(accessTokenSecret) || !def(time) || !def(screenName)) {
				reject(loggedInError);
			}else {
				if (Date.now() - time < TWO_MINUTES) {
					resolve({access_token:accessToken, screen_name:screenName});
				}else {
					twitter.verifyCredentials(accessToken, accessTokenSecret, function(error, data, response) {
					    if (error) {
					        reject(loggedInError);
					    } else {
					    	req.session.twitter.time = Date.now();
					    	resolve({access_token:accessToken,screen_name:screenName});
					    }
					});
				}
			}
		}
	})).then(function(info) {
		res.json(info);
	}, function() {
		var twitterInfo = req.session.twitter;
		if (def(twitterInfo)) {
			var requestToken = twitterInfo.requestToken;
			var requestTokenSecret = twitterInfo.requestTokenSecret;
			var time = twitterInfo.time;
			if (def(requestToken) && def(requestTokenSecret) && def(time) && Date.now() - time < ONE_MINUTE) {
				res.json({request_token:requestToken, auth_url:twitter.getAuthUrl(requestToken)});
				return;
			}
		}
		twitter.getRequestToken(function(error, requestToken, requestTokenSecret, results){
			if (error || !def(requestToken) || !def(requestTokenSecret)) {
				if (def(req.session.twitter)) {
					delete req.session.twitter;
				}
				res.json(errdict(error ? error : "No request token."));
			} else {
				req.session.twitter = {requestToken, requestTokenSecret, time:Date.now()}
				res.json({request_token:requestToken, auth_url:twitter.getAuthUrl(requestToken)});	
			}
		});
	})
	
});

//api/twitter/access_token
app.get('/api/twitter/access_token', function (req, res) {
	var oauthToken = req.param('oauth_token');
	var oauthVerifier = req.param('oauth_verifier');
	if (def(req.session.twitter) && def(req.session.twitter.requestTokenSecret)) {
		twitter.getAccessToken(oauthToken, req.session.twitter.requestTokenSecret, oauthVerifier, function(error, accessToken, accessTokenSecret, results) {
		    if (error || !def(accessToken) || !def(accessTokenSecret)) {
		    	if (def(req.session.twitter)) {
					delete req.session.twitter;
				}
				res.json(errdict(error ? error : "Failed to get access token."));
		    } else {
				twitter.verifyCredentials(accessToken, accessTokenSecret, function(error, data, response) {
				    if (error) {
				    	if (def(req.session.twitter)) {
							delete req.session.twitter;
						}
				        res.json(errdict(error));
				    } else {
				        req.session.twitter = {accessToken, accessTokenSecret, time:Date.now(), screenName:data.screen_name};
					    var result = {access_token:accessToken,screen_name:data.screen_name}
		        		res.json(result);
				    }
				});
		    }
		});
	}else {
		res.json(errdict("Your session has expired."));
	}
});

//Twitter user helpers
function getTwitterTimestamp(date) {
	return Date.parse(date);
}

function processTwitterStatus(status) {
	var result = {};
	result.id = status.id_str;
	result.time = getTwitterTimestamp(status.created_at);
	if (status.in_reply_to_screen_name !== null) {
		result.reply_to = status.in_reply_to_screen_name;
	}
	var entities = status.entities;
	if (def(entities)) {
		var hashtags = entities.hashtags;
		if (def(hashtags) && hashtags.length > 0) {
			result.hashtags = hashtags.map((h)=>(h.text));
		}
		var user_mentions = entities.user_mentions;
		if (def(user_mentions) && user_mentions.length > 0) {
			result.user_mentions = user_mentions.map((h)=>(h.screen_name));
		}
	}
	return result;
}

function getTwitterUserTimeline(req,screenName,maxId,accessToken,accessTokenSecret) {
	var params = {
		screen_name:screenName,
		count:200,
		exclude_replies:false,
		include_rts:true
	};
	if (maxId) {
		params.max_id = maxId;
	}
	return new Promise(function(res,rej) {
		twitter.getTimeline(
			"user_timeline",
			params,
		    accessToken,
		    accessTokenSecret,
		    function(error, data, response) {
		    	if (error) {
		    		rej(err(error));
		    	}else {
		    		var headers = response.headers;
		        	if (def(headers)) {
		        		var remaining = headers["x-rate-limit-remaining"];
		        		var remaining_time = headers["x-rate-limit-reset"];
		        		if (def(remaining) && def(remaining_time)) {
		        			req.session.twitter_remaining = remaining;
		        			req.session.twitter_remaining_time = remaining_time;
		        		}
		        	}
		    		var error = geterr(data);
		    		if (def(error)) {
		    			rej(error);
		    		}else if (data.constructor !== Array) {
		    			rej(err("Bad data type."));
		    		}else {
		    			var processedData = data.map(processTwitterStatus);
		    			if (data.length < 1) {
		    				res({data:processedData});
		    			}else {
		    				res({screen_name:data[0].user.screen_name,data:processedData});
		    			}
		    		}
		    	}
		    }
		)
	});
}

function getTwitterUserTimelineUntil(req,screenName,maxId,untilTime,maxNum,accessToken,accessTokenSecret) {
	return new Promise(function(res,rej) {
		var allData = [];
		getTwitterUserTimeline(req,screenName,maxId,accessToken,accessTokenSecret).then(function({screen_name,data}) {
			allData = allData.concat(data);
			if (maxNum >= 0 && allData.length >= maxNum) {
				res({screen_name,data:allData});
			}else if (data.length > 0) {
				var last = data[data.length - 1];
				if (last.time < untilTime) {
					res({screen_name,data:allData});
				}else {
					getTwitterUserTimelineUntil(req,screenName,last.id,untilTime,maxNum - allData.length,accessToken,accessTokenSecret).then(function({screen_name,data}) {
						if (data.length > 0) {
							if (data[0].id === last.id) {
								allData.pop();
							}
						}
						allData = allData.concat(data);
						res({screen_name,data:allData});
					}, rej);
				}
			}else {
				res({screen_name,data:allData});
			}
		}, rej);
	});
}

//api/twitter/user
app.get('/api/twitter/user', function (req, res) {
	var twitterInfo = req.session.twitter;
	if (!def(twitterInfo)) {
		res.json(errdict("Session expired."));
		return;
	}
	var screenName = req.param('screen_name');
	var accessToken = req.param('access_token');
	var storedAccessToken = twitterInfo.accessToken;
	var accessTokenSecret = twitterInfo.accessTokenSecret;
	if (
		!def(screenName) 			||
		!def(accessToken) 			||
		!def(storedAccessToken) 	||
		!def(accessTokenSecret) 	||
		accessToken !== storedAccessToken
	) {
		res.json(errdict("Session expired."));
		return;
	}
	getTwitterUserTimelineUntil(
		req,
		screenName,
		false,
		Date.now() - TWO_WEEKS,
		4000,
	    accessToken,
	    accessTokenSecret
	).then(function({screen_name,data}) {
		if (data.length === 0) {
			res.json(errdict("No tweets found."));
			return;
		}
		var discarded = 0;
		var last = data[data.length-1].time;
		var now = Date.now();
		var days = Math.floor((now - last) / ONE_DAY);
		var allowed = now - days * ONE_DAY;
		while (def(last) && last < allowed) {
			data.pop();
			discarded += 1;
			last = (data.length > 0) ? data[data.length - 1].time : undefined;
		}
		var times = data.map((status)=>(status.time));
		var tweets = data.length;
		var counts = data.map(function(status) {
			var hour = (new Date(status.time)).getHours();
			var hour1 = (new Date(status.time+HALF_HOUR)).getHours();
			var half_hour = (hour === hour1) ? (2*hour) : (2*hour + 1);
			return {
				half_hour,
				reply: def(status.reply_to),
				mentions: def(status.user_mentions) ? status.user_mentions.length : 0
			};
		});
		var replies = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
		var mentions = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
		var totals = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
		for (var i=0; i<counts.length; i+=1) {
			var status = counts[i];
			var half_hour = status.half_hour*1;
			totals[half_hour] += 1;
			if (status.reply) {
				replies[half_hour] += 1;
			}
			if (status.mentions > 0) {
				mentions[half_hour] += status.mentions;
			}
		}
		var max = 0;
		var mentionWeight = 0.1;
		var replyWeight = 0.15;
		var index = -1;
		var equals = 0;
		var maxEquals = 10;
		for (var i=0; i<totals.length; i+=1) {
			var value = totals[i] + mentions[i] * mentionWeight + replies[i] * replyWeight;
			if (value > max) {
				max = value;
				index = i;
				equals = 1;
			}else if (value === max) {
				equals += 1;
			}
		}
		res.json({screen_name,days,tweets,discarded,replies,mentions,totals,index:(equals > maxEquals) ? (-1) : index});
	}, function(error) {
		res.json(errdict(error));
	});
});

//api/twitter/remaining
app.get('/api/twitter/remaining', function (req, res) {
	var remaining = req.session.twitter_remaining;
	var remaining_time = req.session.twitter_remaining_time;
	if (def(remaining) && def(remaining_time)) {
		res.json({remaining, remaining_time});
	}else {
		res.json(errdict("No information on remaining API calls."));
	}
});

//api/twitter/logout
app.get('/api/twitter/logout', function (req, res) {
	var twitterInfo = req.session.twitter;
	if (def(twitterInfo)) {
		delete req.session.twitter;
		if (def(req.session.accessTokenSecret)) {
			delete req.session.accessTokenSecret;
		}
		var accessToken = req.session.accessToken;
		if (def(accessToken)) {
			delete req.session.accessToken;
			twitter.oauth("invalidate_token",{access_token:accessToken},accessToken,req.session.accessTokenSecret,function() { });
		}
	}
	res.json({success:true});
});

//twitter_callback
app.get('/twitter_callback', function (req, res) {
	var oauthToken = req.param('oauth_token');
	var oauthVerifier = req.param('oauth_verifier');
	res.send("<html><head><title>Close this tab.</title></head><body>"
		+ "<script type='text/javascript'>var twitter"
		+ " = {oauth_token:'"+oauthToken+"',oauth_verifier:'"+oauthVerifier+"'};"
		+ " opener.twitterCallback(window,twitter); function clicked() { "
		+ " opener.focus(); window.close(); }"
		+ " </script> "
		+ "<a href='javascript:clicked();'>Close this tab to continue</a>"
		+ "</body></html>");
});

app.listen(process.env.PORT || 8080);