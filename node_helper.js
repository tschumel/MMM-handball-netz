/**
 * @file node_helper.js
 *
 * @author lavolp3 / fewieden (original module)
 * @license MIT
 *
 * @see  https://github.com/lavolp3/MMM-soccer
 */

/* jshint esversion: 6 */

const axios = require('axios');
const NodeHelper = require('node_helper');
const request = require('request');
const moment = require('moment');

module.exports = NodeHelper.create({

    matches: {},
    tables: {},
    teams: {},
    teamList: {},
    taLeagues: [],
    liveMatches: [],
    liveLeagues: [],
    showStandings: true,
    showTables: true,
    showScorers: true,
    showDetails: true,
    isRunning: false,
    baseURL: 'https://www.ta4-data.de/ta/data',
    requestOptions: {
        method: 'POST',
        headers: {
            Host: 'ta4-data.de',
            'Content-Type': 'application/x-www-form-urlencoded',
            Connection: 'keep-alive',
            Accept: '*/*',
            'User-Agent': 'TorAlarm/20161202 CFNetwork/808.1.4 Darwin/16.1.0',
            'Accept-Language': 'en-us',
            'Accept-Encoding': 'gzip',
            'Content-Length': '49',
        },
        body: JSON.stringify({ lng: 'en-US', device_type: 0, decode: 'decode' }),
        form: false,
    },

    start: function() {
        console.log(`Starting module: ${this.name}`);
    },


    socketNotificationReceived: function(notification, payload) {
        this.log("Socket notification received: " + notification + " Payload: " + JSON.stringify(payload));
        if (notification === 'GET_SOCCER_DATA') {
            this.config = payload;
            for (var i = 0; i < payload.show.length; i++) {
                this.taLeagues.push(this.config.leagues[this.config.show[i]])
            }
            this.log(this.taLeagues);
            this.getLeagueIds(this.taLeagues);
            //this.headers = payload.api_key ? { 'X-Auth-Token': payload.api_key } : {};
            //this.getTables(this.leagues);
            //this.getMatches(this.leagues);
            //this.getMatchDetails(this.leagues);
            if (!this.isRunning) {
                this.log("Starting API call cycle");
                this.isRunning = true;
                this.callInterval = setInterval(() => {
                    self.getLeagueIds(self.leagues);
                    //self.getMatches(self.leagues);
                    //this.getMatchDetails(this.leagues);
                }, this.config.apiCallInterval * 1000);
            }
        }
    },

    
    getLeagueIds: function (leagues) {
        
        const url = `${this.baseURL}/competitions`;
        const self = this;
        const options = {
            ...this.requestOptions,
            url,
        };

        request(options, function (error, _response, body) {
            if (!error && body) {
                const parsedBody = JSON.parse(body);
                const leaguesList = {};
                if ('competitions' in parsedBody) {
                    const competitions = parsedBody.competitions;
                    console.log(leagues);
                    leagues.forEach((l) => {
                        const comp = competitions.find((c) => c.id === l);
                        leaguesList[comp.id] = comp;
                    });
                    self.log(JSON.stringify(leaguesList));
                    Object.keys(leaguesList).forEach((id) => {
                        //self.showStandings && self.getStandings(id);
                        self.showTables && leaguesList[id].has_table && self.getTable(id);
                        //self.showScorers && leaguesList[id].has_scorers && self.getScorers(id);
                    });
                }
                self.sendSocketNotification('LEAGUES', { leaguesList });
            } else {
                Log.error(this.name, 'getLeagueIds', error);
            }
        });
    },

    getTable: function (leagueId) {
        const url = `${this.baseURL}/competitions/${leagueId.toString()}/table`;
        const self = this;
        const options = {
            ...this.requestOptions,
            url,
        };
        request(options, function (error, _response, body) {
            if (!error && body) {
                const data = JSON.parse(body);
                self.log(JSON.stringify(data));
                const tables = data.data.filter((d) => d.type === 'table');
                self.sendSocketNotification('TABLE', {
                    leagueId: leagueId,
                    table: tables,
                });
                /*self.timeoutTable[leagueId] = setTimeout(function () {
                    self.getTable(leagueId);
                }, self.refreshTime);*/
            }
        });
    },

    getStandings: function (leagueId) {
        const url = `${this.baseURL}/competitions/${leagueId.toString()}/matches/round/0`;
        const self = this;
        const options = {
            ...this.requestOptions,
            url,
        };

        request(options, function async (error, _response, body) {
            if (!error && body) {
                const data = JSON.parse(body);
                console.log(self.name, 'getStandings | data', JSON.stringify(data));
                self.refreshTime = (data.refresh_time || 5 * 60) * 1000;
                const standings = data;

                const forLoop = async () => {
                    if(self.showDetails) {
                        for (let s of standings.data) {
                            if (s.type === 'matches') {
                                const matches = s.matches;
                                for(let m of matches) {
                                const d = await self.getDetails(leagueId, m.match_id);
                                console.log(JSON.stringify(d));
                                details = d.filter(t => t.type === 'details');
                                    m.details = details && details[0] ? details[0].details : []
                                };
                            }
                        };
                    }
                }

                forLoop().then(() => {
                    console.log(standings);
                    self.sendSocketNotification('STANDINGS', {
                        leagueId: leagueId,
                        standings: standings,
                    });
                    /*self.timeoutStandings[leagueId] = setTimeout(function () {
                        self.getStandings(leagueId);
                    }, self.refreshTime);*/
                });
            } else {
                Log.error(error);
                /*self.timeoutStandings[leagueId] = setTimeout(function () {
                    self.getStandings(leagueId);
                }, 5 * 60 * 1000);*/
            }
        });
    },
    
    
    getDetails: function (leagueId, matchId) {
        const url = `${this.baseURL}/competitions/${leagueId.toString()}/matches/${matchId.toString()}/details`;
        const self = this;
        const options = {
            ...this.requestOptions,
            url,
        };
        let details = [];
        return new Promise((resolve, _reject) => {
            request(options, function (error, _response, body) {
                if (!error && body) {
                    const data = JSON.parse(body);
                    console.log(JSON.stringify(data));
                    details = data.data || [];
                }
                resolve(details);
            });
        });
    },

    
    getScorers: function (leagueId) {
        const url = `${this.baseURL}/competitions/${leagueId.toString()}/scorers`;
        Log.info(this.name, 'getScorers', url);
        const self = this;
        const options = {
            ...this.requestOptions,
            url,
        };

        request(options, function (error, _response, body) {
            if (!error && body) {
                const data = JSON.parse(body);
                Log.debug(self.name, 'getScorers | data', JSON.stringify(data, null, 2));
                self.refreshTime = (data.refresh_time || 5 * 60) * 1000;
                Log.debug(self.name, 'getScorers | refresh_time', data.refresh_time, self.refreshTime);
                const scorers = data.data || [];
                self.sendSocketNotification('SCORERS', {
                    leagueId: leagueId,
                    scorers: scorers,
                });
                self.timeoutScorers[leagueId] = setTimeout(function () {
                    self.getScorers(leagueId);
                }, self.refreshTime);
            } else {
                Log.error(error);
                self.timeoutScorers[leagueId] = setTimeout(function () {
                    self.getScorers(leagueId);
                }, 5 * 60 * 1000);
            }
        });
    },


    
    getTables: function(leagues) {
        var self = this;
        this.log("Collecting league tables for leagues: "+leagues);
        var urlArray = leagues.map(league => { return `http://api.football-data.org/v2/competitions/${league}/standings`; });
        Promise.all(urlArray.map(url => {
            return axios.get(url, { headers: self.headers })
            .then(function (response) {
                console.log("Requests available: " + response.headers["x-requests-available-minute"]);
                var tableData = response.data;
                var tables = {
                    competition: tableData.competition,
                    season: tableData.season,
                    standings: tableData.standings,
                };
                //self.log(tables);
                return(tables);
            })
            .catch(function (error) {
                self.handleErrors(error, url);
                return {};
            });
        }))
        .then(function(tableArray) {
            tableArray.forEach(tables => {
                if (tables.hasOwnProperty('standings')) {
                    tables.standings.forEach(standing => {
                        standing.table.forEach(team => {
                            self.teams[team.team.id] = team.team;
                            self.teamList[team.team.name] = team.team.name;
                        });
                    });
                    self.tables[tables.competition.code] = tables;
                 }
            });
            //self.log("Collected Tables: " + self.tables);
            //self.log("Collected Teams: " + JSON.stringify(self.teams));
            //self.log("TableArray: " + tableArray);
            self.sendSocketNotification("TABLES", self.tables);
            self.sendSocketNotification("TEAMS", self.teams);
        })
        /*.catch(function(error) {
            console.error("[MMM-soccer] ERROR occured while fetching tables: " + error);
        });*/
    },

    

    handleErrors: function(error, url) {
        console.log("An error occured while requesting the API for Data: "+error);
        console.log("URL: "+url);
        if (error.response && error.response.status === 429) {
            console.log(error.response.status + ": API Request Quota of 10 calls per minute exceeded. Try selecting less leagues.");
        } else if (error.request) {
            console.log(error.request);
        } else {
            // Something happened in setting up the request that triggered an Error
            console.log('Error: ', error.message);
        }
    },

    toggleLiveMode: function (isLive) {
        if (isLive != this.liveMode) {
            clearInterval(this.callInterval);
            if (isLive) {
                this.log("Live Mode activated!");
                //this.leagues = this.liveLeagues;
                this.sendSocketNotification("LIVE", { live: true, matches: this.liveMatches, leagues: this.liveLeagues });
                this.scheduleAPICalls(true);
            } else {
                this.log("Usual mode active!");
                //this.leagues = this.config.show;
                this.sendSocketNotification("LIVE", { live: false, matches: this.liveMatches, leagues: this.liveLeagues });
                this.scheduleAPICalls(false);
            }
            this.liveMode = isLive;
        }
    },

    log: function (msg) {
        if (this.config && this.config.debug) {
            console.log(this.name + ":", JSON.stringify(msg));
        }
    },
});
