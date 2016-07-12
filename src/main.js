import React from 'react';
import ReactDOM from 'react-dom';
import { connect } from 'react-redux'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import Immutable from 'immutable'
import $ from 'jquery'
import Chart from 'chart.js'
var moment = require('moment-timezone');

//Time Zones
var timezones = moment.tz.names();
var defaultTimezone = moment.tz.guess();
function timezoneOffset(timezoneName) {
  return moment.tz.zone(timezoneName).offset(Date.now());
}

//Utilities
function pad(num, size) {
  var s = num+"";
  while (s.length < size) s = "0" + s;
  return s;
}

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

//Object utilities
function mutate(object,newValues) {
  var copy = {};
  for (var property in object) {
    if (object.hasOwnProperty(property)) {
      if (!def(newValues[property])) {
        copy[property] = object[property];
      }
    }
  }
  for (var property in newValues) {
    if (newValues.hasOwnProperty(property)) {
      copy[property] = newValues[property];
    }
  }
  return copy;
}
function remove(object,key) {
  var keys = (key.constructor === Array) ? key : [key];
  var copy = {};
  for (var property in object) {
    if (object.hasOwnProperty(property)) {
      if (keys.indexOf(property) === -1) {
        copy[property] = object[property];
      }
    }
  }
  return copy;
}
function rotate(array,amount) {
  while (amount < 0) {
    amount += array.length;
  }
  if (amount > 0) {
    amount = amount % array.length;
    var first = array.slice(0,amount);
    var second = array.slice(amount);
    return second.concat(first);
  }else {
    return array;
  }
}

//APIs
function getJSON(url) {
  return new Promise(function (res,rej) {
    $.ajax({
      url,
      dataType: 'json',
      cache: false,
      success: res,
      error: function(xhr, status, error) {
        rej(err(error));
      }
    });
  });
}

//Twitter
const TwitterAPI = {
  baseURL:"/api/twitter/",
  endpoint:{
    auth_info:"auth_info",
    access_token:"access_token",
    logout:"logout",
    user:"user",
    remaining:"remaining"
  }
}

function getTwitterJSON(endpoint) {
  return new Promise(function(res,rej) {
    getJSON(TwitterAPI.baseURL + endpoint).then(function(json) {
      var error = geterr(json);
      if (def(error)) {
        rej(error);
        return;
      }
      res(json);
    }, rej);
  });
}

function getTwitterRequestAuthInfo() {
  return new Promise(function(res,rej) {
    getTwitterJSON(TwitterAPI.endpoint.auth_info).then(function(json) {
      if (!def(json.access_token) && (!def(json.request_token) || !def(json.auth_url))) {
        rej(err("No request token or authorization URL."));
        return;
      }
      res(json);
    }, rej);
  });
}

function getTwitterVerifiedAccessToken(oauthToken,oauthVerifier) {
  return new Promise(function(res,rej) {
    getTwitterJSON(TwitterAPI.endpoint.access_token + "?oauth_token=" + oauthToken + "&oauth_verifier=" + oauthVerifier).then(function(json) {
      res(json);
    }, rej);
  });
}

function performTwitterLogout() {
  return getTwitterJSON(TwitterAPI.endpoint.logout);
}

function getTwitterUserInfo(name,access_token) {
  return getTwitterJSON(TwitterAPI.endpoint.user + "?screen_name=" + encodeURIComponent(name) + "&access_token=" + access_token);
}

function getTwitterRemainingInfo() {
  return getTwitterJSON(TwitterAPI.endpoint.remaining);
}

//React classes
const App = React.createClass({
  render: function() {
    if (!def(this.props.twitter) && !def(this.props.twitter_auth_request)) { // No twitter auth info yet
      return <NoTwitter twitterStart={this.props.twitterStart} error={this.props.twitter_error} onTryTwitterAgain={this.props.onTryTwitterAgain}/>;
    } else if (!def(this.props.twitter)) {
      return <TwitterAuth info={this.props.twitter_auth_request} onTwitterLoginClick={this.props.onTwitterLoginClick}/>;
    } else { // Has Twitter info
      return <InnerApp
        twitter={this.props.twitter}
        user_info={this.props.user_info}
        user_error={this.props.user_error}
        twitter_remaining={this.props.twitter_remaining}
        twitter_remaining_time={this.props.twitter_remaining_time}
        loading={this.props.loading}
        timezone={this.props.timezone}
        onTwitterLogoutClick={this.props.onTwitterLogoutClick}
        onTwitterFormSubmit={this.props.onTwitterFormSubmit}
        onTimezoneChange={this.props.onTimezoneChange}
      />;
    }
  }
});

const NoTwitter = React.createClass({
  twitterMayStart: function() {
    if (!def(this.props.error)) {
      this.props.twitterStart();
    }
  },
  componentDidMount: function() {
    this.twitterMayStart();
  },
  componentDidUpdate: function() {
    this.twitterMayStart();
  },
  render: function() {
    if (!def(this.props.error)) {
      return <div>Loading Twitter request token...</div>;
    }else {
      return (
        <div>Error: {this.props.error.message}. <a href="" onClick={this.props.onTryTwitterAgain}>Try again.</a></div>
      )
    }
  }
});

const TwitterAuth = React.createClass({
  onTwitterLoginClick: function(event) {
    event.preventDefault();
    this.props.onTwitterLoginClick(event,this.props.info.auth_url);
  },
  render: function() {
    return <div><a href="" onClick={this.onTwitterLoginClick}>Login with Twitter</a></div>;
  }
});

const InnerApp = React.createClass({
  render: function() {
    return (
      <div>
        <TwitterLoggedInHeader twitter={this.props.twitter} onTwitterLogoutClick={this.props.onTwitterLogoutClick} />
        <TwitterForm twitter={this.props.twitter} onTwitterFormSubmit={this.props.onTwitterFormSubmit} loading={this.props.loading}/>
        <TwitterWarning remaining={this.props.twitter_remaining} remaining_time={this.props.twitter_remaining_time}/>
        <TwitterResult
          json={this.props.user_info} 
          error={this.props.user_error}
          timezone={this.props.timezone}
          onTimezoneChange={this.props.onTimezoneChange}
        />
      </div>
    )
  }
});

const TwitterLoggedInHeader = React.createClass({
  render: function() {
    return (<div id="logged-in-header"><span>Logged in as @{this.props.twitter.screen_name} </span>(<a href="" onClick={this.props.onTwitterLogoutClick}>logout</a>)</div>)
  }
});

const TwitterWarning = React.createClass({
  render: function() {
    var warnings = [(
      <div id="twitter-warning" key="first-warning">
        Due to Twitter API's constraints, you may only be able to query a few users every 15 minutes.
      </div>
    )];
    // Not adding second warning
    if (false && def(this.props.remaining) && def(this.props.remaining_time)) {
      warnings.push(
        <div key="second-warning">
          Remaining number of API calls: {this.props.remaining}. Time: {this.props.remaining_time}
        </div>
      );
    }
    return (<div>
      {warnings}
    </div>);
  }
});

var twitterNameFieldId = "twitter-name-field";
const TwitterForm = React.createClass({
  onTwitterFormSubmit: function(event) {
    event.preventDefault();
    this.props.onTwitterFormSubmit(event,$("#" + twitterNameFieldId).val(),this.props.twitter);
  },
  render: function() {
    return (
      <div id="twitter-form">
        <span id="twitter-at-sign">@</span>
        <input type='text' id={twitterNameFieldId} disabled={this.props.loading} placeholder="Twitter Username"/>
        <button id="twitter-go-button" onClick={this.onTwitterFormSubmit} disabled={this.props.loading}>go!</button>
      </div>
    )
  }
});

const TwitterResult = React.createClass({
  render: function() {
    if (def(this.props.error)) {
      return (
        <div>
          Error: {this.props.error.message}
        </div>
      )
    }else if (def(this.props.json)) {
      return (
        <div>
          <TimezoneSelect timezone={this.props.timezone} onTimezoneChange={this.props.onTimezoneChange}/>
          <TweetChartContainer timezone={this.props.timezone} json={this.props.json} />
        </div>
      )
    }else {
      return false;
    }
  }
});

const TimezoneSelect = React.createClass({
  render: function() {
    var options = timezones.map(function(timezone) {
      return <option key={timezone}>{timezone}</option>
    }.bind(this));
    return (
      <div>
        Local Time Zone: <select value={this.props.timezone} onChange={this.props.onTimezoneChange}>{options}</select>
      </div>
    );
  }
});

var $chartOverlay = undefined;

const TweetChartContainer = React.createClass({
  componentDidMount: function() {
    $chartOverlay = $("#chart-overlay");
  },
  componentWillUnmount: function() {
    $chartOverlay = undefined;
  },
  render: function() {
    var offset = timezoneOffset(this.props.timezone);
    var amount = arrayOffset(offset);
    var index = (this.props.json.index + 48 - amount) % 48;
    var totalMinutes = index * 30 + 15;
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes - hours * 60;
    return (
      <div id="chart-container">
        <div id="chart-top">
          Tweet @{this.props.json.screen_name} at around {hours}:{pad(minutes,2)}
        </div>
        <div id="chart-overlay"><TweetChartBar index={index}/></div>
        <TweetChart timezone_amount={amount} json={this.props.json} />
      </div>
    )
  }
})

const TweetChartBar = React.createClass({
  render: function() {
    var width = 100/48;
    var left = this.props.index * width;
    var style = {left:left + "%",width:width + "%"}
    return <div id="chart-bar" style={style}/>;
  }
});

var chart = undefined;
var $chart = undefined;

Chart.pluginService.register({
  afterDraw:function(updatedChart) {
    if (chart === updatedChart && def($chartOverlay) && def($chart)) {
      var chartPosition = $chart.position();
      var chartWidth = $chart.width();
      var chartHeight = $chart.height();
      var chartArea = chart.chartArea;
      var left = chartPosition.left + chartArea.left;
      var top = chartPosition.top + chartArea.top;
      var width = chartArea.right - chartArea.left - chart.scales["x-axis-0"].paddingRight;
      var height = chartArea.bottom - chartArea.top;
      $chartOverlay.css({
        left:left+"px",
        top:top+"px",
        width:width+"px",
        height:height+"px"
      });
    }
  }
});

const TweetChart = React.createClass({
  componentDidMount: function() {
    chart = renderChart(this.props.timezone_amount,this.props.json);
    $chart = $("#chart");
  },
  componentWillUnmount: function() {
    chart = undefined;
    $chart = undefined;
  },
  shouldComponentUpdate: function(nextProps) {
    return false;
  },
  componentWillReceiveProps: function(nextProps) {
    if (nextProps.timezone_amount !== this.props.timezone_amount || nextProps.json !== this.props.json) {
      renderChart(nextProps.timezone_amount,nextProps.json);
    }
  },
  render: function() {
    return <canvas id="chart"/>
  }
});

function chartLabels() {
  var labels = [];
  for (var i=0; i<=96; i+=1) {
    if (i % 12 === 0) {
      labels.push((Math.floor((i+1)/4) % 24) + ":00");
    }else {
      labels.push("");
    }
  }
  return labels;
}

function chartZeros() {
  var zeros = [];
  for (var i=0; i<=96; i+=1) {
    zeros.push(0);
  }
  return zeros;
}

function arrayOffset(minuteOffset) {
  if (minuteOffset > 0) {
    return Math.floor((minuteOffset + 15) / 30);
  }else if (minuteOffset < 0) {
    return -Math.floor((Math.abs(minuteOffset) + 15) / 30);
  }else {
    return 0;
  }
}

function spreadData(points) {
  var count = 2*points.length + 1;
  var data = [];
  for (var i=0; i<count; i+=1) {
    if (i === 0 || i === count - 1) {
      data.push((points[0] + points[points.length - 1]) / 2);
    }else if (i % 2 === 1) {
      data.push(points[Math.floor(i / 2)]);
    }else {
      var index = Math.floor((i+1) / 2);
      data.push((points[index] + points[index-1]) / 2);
    }
  }
  return data;
}

function createChart(ctx) {
  var zeros = chartZeros();
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels(),
      datasets: [{
          label:"tweets",
          lineTension: 0.1,
          pointRadius: 0,
          borderColor:"rgba(255,0,0,0.6)",
          backgroundColor:"transparent",
          cornerRadius:4,
          data: zeros
      },
      {
          label:"mentions",
          lineTension: 0.1,
          pointRadius: 0,
          borderColor:"rgba(0,255,0,0.6)",
          backgroundColor:"transparent",
          cornerRadius:4,
          data: zeros
      },
      {
          label:"replies",
          lineTension: 0.1,
          pointRadius: 0,
          borderColor:"rgba(0,0,255,0.6)",
          backgroundColor:"transparent",
          cornerRadius:4,
          data: zeros
      }]
    },
    options: {
      legend: {
        position:"bottom"
      },
      scales: {
        yAxes: [{
          gridLines: {
            display:false
          },
          ticks: {
            beginAtZero:true
          }
        }],
        xAxes: [{
          gridLines: {
            display:false
          },
          right:0
        }]
      }
    }
  });
}

function renderChart(timezone_amount,json) {
  if (!def(chart)) {
    var ctx = document.getElementById("chart");
    var innerCtx = document.getElementById("inner-chart");
    chart = createChart(ctx);
  }
  var totals = spreadData(rotate(json.totals,timezone_amount));
  var mentions = spreadData(rotate(json.mentions,timezone_amount));
  var replies = spreadData(rotate(json.replies,timezone_amount));

  chart.data.datasets[0].data = totals;
  chart.data.datasets[1].data = mentions;
  chart.data.datasets[2].data = replies;
  chart.update();

  console.log(chart);

  return chart;
}



//Redux store model
// {
//   twitter:Immutable.Map({...})
// }

//Redux twitter actions
const TwitterAction = {
  SET:"TWITTER_SET",
  CLEAR:"TWITTER_CLEAR",
  ERROR:"TWITTER_ERROR",
  SHOW_AUTH_SCREEN:"TWITTER_SHOW_AUTH_SCREEN",
  HIDE_AUTH_SCREEN:"TWITTER_HIDE_AUTH_SCREEN",
  SET_USER_INFO:"SET_TWITTER_USER_INFO",
  SET_USER_ERROR:"SET_TWITTER_USER_ERROR",
  SET_REMAINING_INFO:"SET_TWITTER_REMAINING_INFO",
  SET_IS_LOADING:"SET_TWITTER_USER_IS_LOADING",
}

const AppAction = {
  SET_TIMEZONE:"SET_TIMEZONE"
}
const setTwitterInfo = (info)=>({ type:TwitterAction.SET, info });
const clearTwitterInfo = ()=>({ type:TwitterAction.CLEAR });
const showTwitterAuthScreen = (info)=>({ type:TwitterAction.SHOW_AUTH_SCREEN, info });
const showTwitterError = (error)=>({ type:TwitterAction.ERROR, error });
const setTwitterUserInfo = (info)=>({ type:TwitterAction.SET_USER_INFO, info });
const setTwitterUserError = (error)=>({ type:TwitterAction.SET_USER_ERROR, error });
const setRemainingInfo = (remaining,remaining_time)=>({ type:TwitterAction.SET_REMAINING_INFO, remaining, remaining_time });
const setIsLoading = (loading)=>({ type:TwitterAction.SET_IS_LOADING, loading });
const setTimezone = (timezone)=>({type:AppAction.SET_TIMEZONE, timezone });

//Redux reducer
const initialState = {timezone:defaultTimezone};
function app(state, action) {
  if (!def(state)) {
    return initialState
  }
  switch (action.type) {
    case TwitterAction.SET:
      return mutate(remove(state,["twitter","twitter_error","twitter_auth_request","user_info","user_error","loading"]),{twitter:action.info});
      break;
    case TwitterAction.CLEAR:
      return remove(state,["twitter","twitter_error","twitter_auth_request","user_info","user_error","twitter_remaining","twitter_remaining_time","loading"]);
      break;
    case TwitterAction.ERROR:
      return mutate(remove(state,["twitter","twitter_error","twitter_auth_request","user_info","user_error","twitter_remaining","twitter_remaining_time","loading"]),{twitter_error:action.error});
      return newState;
      break;
    case TwitterAction.SHOW_AUTH_SCREEN:
      return mutate(remove(state,["twitter","twitter_error","twitter_auth_request","user_info","user_error","twitter_remaining","twitter_remaining_time","loading"]),{twitter_auth_request:action.info});
      break;
    case TwitterAction.SET_USER_INFO:
      return mutate(remove(state,["twitter_error","twitter_auth_request","user_error","loading"]),{user_info:action.info});
      break;
    case TwitterAction.SET_USER_ERROR:
      return mutate(remove(state,["twitter_error","twitter_auth_request","user_info","loading"]),{user_error:action.error});
      break;
    case TwitterAction.SET_REMAINING_INFO:
      return mutate(state,{twitter_remaining:action.remaining, twitter_remaining_time:action.remaining_time});
      break;
    case TwitterAction.SET_IS_LOADING:
      return mutate(state,{loading:action.loading});
      break;
    case AppAction.SET_TIMEZONE:
      return mutate(state,{timezone:action.timezone});
    default:
      return state;
  }
  return state
}

//Twitter callback listener
var twitterCallbackListener = function(info) {
  // Placeholder code
  console.log("got twitter info:");
  console.log(info);
}

window.twitterCallback = function(win,info) {
  twitterCallbackListener(info);
  window.focus();
}

//Redux setup
const store = createStore(app);
const mapStateToProps = (state) => {
  return state;
}
var loadingToken = {cancelled:false};
var resetLoadingToken = function(dispatch) {
  loadingToken.cancelled = true;
  loadingToken = {cancelled:false};
  dispatch(setIsLoading(false));
  return loadingToken;
};
const mapDispatchToProps = (dispatch) => {
  return {
    twitterStart: () => {
      getTwitterRequestAuthInfo().then(function(info) {
        if (!def(info.access_token)) {
          dispatch(showTwitterAuthScreen(info));
        }else {
          dispatch(setTwitterInfo(info));
        }
      }, function(error) {
        dispatch(showTwitterError(error));
      });
    },
    onTryTwitterAgain: (event) => {
      event.preventDefault();
      dispatch(clearTwitterInfo());
    },
    onTwitterLoginClick: (event,url) => {
      event.preventDefault();
      var win = window.open(url,"_blank");
      if (win) {
        win.focus();
        twitterCallbackListener = function(info) {
          getTwitterVerifiedAccessToken(info.oauth_token,info.oauth_verifier).then(function(accessInfo) {
            dispatch(setTwitterInfo(accessInfo));
          }, function(error) {
            dispatch(showTwitterError(error));
          })
        }
      }else {
        dispatch(showTwitterError(err("Make sure this page is allowed to open new tabs.")));
      }
    },
    onTwitterLogoutClick: function(event) {
      event.preventDefault();
      resetLoadingToken(dispatch);
      performTwitterLogout().then(function() {
        dispatch(clearTwitterInfo());
      }, function() {
        alert("Something went wrong. Please try again.");
      });
    },
    onTwitterFormSubmit: function(event,name,twitter) {
      event.preventDefault();
      var token = resetLoadingToken(dispatch);
      dispatch(setIsLoading(true));
      getTwitterUserInfo(name,twitter.access_token).then(function(userInfo) {
        if (!token.cancelled) {
          dispatch(setIsLoading(false));
          dispatch(setTwitterUserInfo(userInfo));
          updateRemainingInfo(dispatch);
        }
      }, function(error) {
        if (!token.cancelled) {
          dispatch(setIsLoading(false));
          dispatch(setTwitterUserError(error));
          updateRemainingInfo(dispatch);
        }
      });
    },
    onTimezoneChange: function(event) {
      dispatch(setTimezone(event.target.value));
    }
  }
}
function updateRemainingInfo(dispatch) {
  getTwitterRemainingInfo().then(function(remainingInfo) {
    dispatch(setRemainingInfo(remainingInfo.remaining,remainingInfo.remaining_time));
  }, function(error) {
    //Nothing
  });
}

const VisibleApp = connect(mapStateToProps,mapDispatchToProps)(App);

ReactDOM.render(
  <Provider store={store}><VisibleApp /></Provider>,
  document.getElementById('content')
);