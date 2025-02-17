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
const moment = require('moment');
var phase;
var phaseName;
module.exports = NodeHelper.create({

    matches: {},
    tables: {},
    teams: {},
    teamList: {},
    liveMatches: [],
    liveLeagues: [],
    isRunning: false,

    start: function() {
        console.log(`Starting module: ${this.name}`);
    },


    socketNotificationReceived: function(notification, payload) {
        if (notification === 'GET_HANDBALL_DATA') {
            this.log("Socket notification received: " + notification + " Payload: " + JSON.stringify(payload));
            this.config = payload;
			this.clubs = this.config.clubs;
            this.leagues = this.config.show;
            this.headers = {};
			//this.getClubTeams(this.clubs);
            this.getTables(this.leagues);
            this.getMatches(this.leagues);
            if (!this.isRunning) {
                this.log("Starting API call cycle");
                this.liveMode = false;
                this.isRunning = true;
                this.scheduleAPICalls(false);
            }
        }
    },

    scheduleAPICalls: function(live) {
        var self = this;
        //var updateInterval = (this.liveLeagues.length > 0) ? (60/(Math.floor(5/this.liveLeagues.length))) * 1000 : this.config.apiCallInterval * 1000;
        var updateInterval = (this.liveLeagues.length > 0) ? 60 * 1000 : this.config.apiCallInterval * 1000;
        this.callInterval = setInterval(() => {
            self.getTables(self.leagues);
            self.getMatches(self.leagues);
            //self.getMatchDetails(self.liveMatches);
        }, updateInterval);
    },

	// in progress
	getClubTeams: function(clubs) {
	// https://www.handball.net/a/sportdata/1/widgets/club/handball4all.schleswig-holstein.1501/schedule?	
        var self = this;
		var isoWeek = moment().isoWeek();   
        this.log("API-Call: Collecting leagues for clubs: "+clubs);		
        var urlArray = clubs.map(club => { 
			var apiUrl = "https://www.handball.net/a/sportdata/1/widgets/club/"+ club +"/schedule?";
			return apiUrl; 
		});
		Promise.all(urlArray.map(url => {
            return axios.get(url, { headers: self.headers})
            .then(function (response) {
                self.log("Requests available:");
				let urlObj = new URL(url);
				let urlPara = new URLSearchParams(urlObj.search);
				var clubData = response.data;
				/*
				var clubTeamsLeagues = {
					
				}
				*/
            })
            .catch(function (error) {
                self.handleErrors(error, url);
                return {};
            });
			
		}));		
	},

    getTables: function(leagues) {
        var self = this;
		var isoWeek = moment().isoWeek();   
        this.log("API-Call: Collecting tables for leagues: "+leagues);
		
        var urlArray = leagues.map(league => { 
			var params = league.split('#');
			var apiUrl = "https://www.handball.net/a/sportdata/1/widgets/tournament/"+ params[0] +"/table?";
			phase = params.length > 1 ? params[1] :"";
			if (phase) apiUrl = apiUrl + "phase=" + phase;
			return apiUrl; 
		});
        Promise.all(urlArray.map(url => {
            return axios.get(url, { headers: self.headers})
            .then(function (response) {
                self.log("Requests available:");
				let urlObj = new URL(url);
				let urlPara = new URLSearchParams(urlObj.search);
				
                var tableData = response.data;
	            var tables = {
					  competition: {
						id: tableData.tournament.id,
						phase: urlPara.get("phase"),
						name: tableData.table.tournament.name,
						phaseName: null,
						code: tableData.tournament.id,
						type: 'LEAGUE',
						emblem: tableData.table.tournament.logo.replace("handball-net:", "https://www.handball.net/"),
					  },
 					  season: {
						id: tableData.tournament.id,
						startDate: null,//'2024-08-23',
						endDate:  null,//'2025-05-17',
						currentMatchday: isoWeek,
						winner: null
					  },
					  standings: [
						{
						  stage: 'REGULAR_SEASON',
						  type: 'TOTAL',
						  group: null,
						  table: tableData.table.rows
						}
					  ]
                };			
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
                            self.teams[team.id] = team;
                            self.teamList[team.name] = team.name;
                        });
                    });
					if(tables.competition.phase) self.tables[tables.competition.code+"#"+tables.competition.phase] = tables;
                    else self.tables[tables.competition.code] = tables;
                 }
            });
			
            self.sendSocketNotification("TABLES", self.tables);
            self.sendSocketNotification("TEAMS", self.teams);
        })
        .catch(function(error) {
            console.error("[MMM-handball-netz] ERROR occured while fetching tables: " + error);
        });
    },


    getMatches: function(leagues) {
        var now = moment().subtract(60*13, "minutes");	//subtract minutes or hours to test live mode
        this.log("API-Call: Collecting matches for leagues " + leagues);
        var urlArray = leagues.map(league => { 		
			var params = league.split('#');
			var apiUrl = "https://www.handball.net/a/sportdata/1/widgets/tournament/"+ params[0] +"/schedule?";
			phase = params.length > 1 ? params[1] :"";
			if (phase) apiUrl = apiUrl + "phase=" + phase;
			return apiUrl; 
		});
        this.liveLeagues = [];
        var self = this;

        Promise.all(urlArray.map(url => {
            return axios.get(url, { headers: self.headers })
            .then(function (response) {
				let urlObj = new URL(url);
				let urlPara = new URLSearchParams(urlObj.search);				
                var matchesData = response.data;
                var currentLeague = matchesData.tournament.id;	
				phaseName = ""; // Steht in matchesData.schedule.data...match.phase !!!!!!
				phase = null;
				if(urlPara.get("phase")) currentLeague+"#"+urlPara.get("phase");				
                matchesData.schedule.data.forEach(match => {
					phase = match.hasOwnProperty('phase') ? match.phase.id : ""; // Warum muss phase global declariert werden?
					phaseName = match.hasOwnProperty('phase') ? match.phase.name : ""; // Warum muss phaseName global declariert werden?
                    //delete match.referees;
                    //check for live matches
                    if (match.state == "Live" || Math.abs(moment(match.startsAt).diff(now, 'seconds')) < self.config.apiCallInterval * 2) {
                        if (self.liveMatches.indexOf(match.id) === -1) {
                            self.log(`Live match detected starting at ${moment(match.match.startsAt).format("HH:mm")}, Home Team: ${match.homeTeam.name}`);
                            self.log(`Live match ${match.id} added at ${moment().format("HH:mm")}`);
                            self.liveMatches.push(match.id);
                        }
                        if (self.liveLeagues.indexOf(currentLeague) === -1) {
                            self.log(`Live league ${currentLeague} added at ${moment().format("HH:mm")}`);
                            self.liveLeagues.push(currentLeague);
                        }
                    } else {
                        if (self.liveMatches.indexOf(match.id)!= -1) {
                            self.log("Live match finished!");
                            self.liveMatches.splice(self.liveMatches.indexOf(match.id), 1);
                        }
                    }
                });

				var handballMatches = {
						competition: {
							id : matchesData.tournament.id,
							name: matchesData.tournament.name,
							phase: urlPara.get("phase"),//phase
							phaseName: phaseName,
							code: matchesData.tournament.id,
							type: "LEAGUE",
							emblem: matchesData.tournament.logo.replace("handball-net:", "https://www.handball.net/")
						},
						matches : matchesData.schedule.data ,
						filters : {season: "2024"}, // No Season Infos in hnet, so setting to magic number Season 2024-2025
				};
                return(handballMatches);
            })
            .catch(function (error) {
                self.handleErrors(error, url);
                return {};
            });
        }))
        .then(function (matchesArray) {
            matchesArray.forEach(comp => {
                if (comp.hasOwnProperty('competition')) {
					if(comp.competition.phase) self.matches[comp.competition.code+"#"+comp.competition.phase] = comp;
                    else self.matches[comp.competition.code] = comp;
                }
            });
            self.log("Live matches: "+JSON.stringify(self.liveMatches));
            self.log("Live leagues: "+JSON.stringify(self.liveLeagues));
            self.sendSocketNotification("MATCHES", self.matches);
            self.toggleLiveMode(self.liveMatches.length > 0);
        })
        .catch(function(error) {
            console.error("[MMM-handball-netz] ERROR occured while fetching matches: " + error);
        });
    },

/*
	Wird noch nicht genutzt !

    getMatchDetails: function (matches) {
        var self = this;
        this.log("fkt getMatchDetails Getting match details for (${league}) matches: " + matches);
        //var urlArray = matches.map(match => { return `http://api.football-data.org/v2/matches/${match}`; });
        var urlArray = matches.map(match => { return `https://www.handball.net/a/sportdata/1/widgets/tournament/${league}/schedule?`; });
        Promise.all(urlArray.map(url => {
            return axios.get(url, { headers: self.headers })
            .then(function (response) {
                self.log("Requests available: " + response.headers["x-requests-available-minute"]);
                var matchData = response.data;
                self.log(matchData);
                if (matchData.match.status != "IN_PLAY" && self.liveMatches.indexOf(matchData.match.id)!= -1) {
                    self.log("Live match finished");
                    self.liveMatches.splice(self.liveMatches.indexOf(comp.matches[m].id), 1);
                    self.log("Live matches: "+self.liveMatches);
                }
                return(matchData);
            })
            .catch(function (error) {
                self.handleErrors(error, url);
                return {};
            });
        }))
        .then(function (liveMatchesArray) {
            //LiveMatchesArray.forEach(match => {
            //    liveMatches[match.match.competition.id] = match;
            // });
            self.sendSocketNotification("LIVE_MATCHES", liveMatchesArray);
        });
    },
*/

    handleErrors: function(error, url) {
        console.log("An error occured while requesting the API for Data: "+error);
        console.log("URL: "+url);
        if (error.response && error.response.status === 429) {
            console.log(error.response.status + ": API Request Quota per minute exceeded. Try selecting less leagues.");
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
