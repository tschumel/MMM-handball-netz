/**
 * @file MMM-handball-netz.js
 *
 * @author lavolp3/fewieden
 * @license MIT
 *
 * @see  https://github.com/lavolp3/MMM-soccer
 */

/* jshint esversion: 6 */

/* global Module Log */

Module.register('MMM-handball-netz', {

    defaults: {
        api_key: false,
        colored: false,
      	width: 400,
        show: ['sr.competition.149'],
        updateInterval: 30,
        apiCallInterval: 10 * 60,
        focus_on: false,
        fadeFocus: true,
        max_teams: false,
        logos: true,
		leagueLogos: false,
        showTables: true,
        showMatches: true,
        showMatchDay: true,
        matchType: 'league',    //choose 'next', 'daily', or 'league'
        numberOfNextMatches: 8,
        leagues: {
            GERMANY: 'sr.competition.149'
        },
        replace: 'default',     //choose 'default', 'short' or '' for original names
        daysOffset: 0,
        debug: false,
    },

    modals: {
        standings: false,
        help: false
    },

    voice: {
        mode: 'HANDBALL',
        sentences: [
            'OPEN HELP',
            'CLOSE HELP',
            'SHOW STANDINGS OF COUNTRY NAME',
            'EXPAND VIEW',
            'COLLAPSE VIEW'
        ]
    },

    loading: true,
    tables: {},
    matches: {},
    teams: {},
    matchDay: "",
    showTable: true,
    leagues: [],
    liveMode: false,
    liveMatches: [],
    liveLeagues: [],
    replacements: {
        default: {}
    },
    competition: '',


    start: function() {
        Log.info(`Starting module: ${this.name}`);
        this.addFilters();
        this.leagues = this.config.show;
        this.competition = this.leagues[0];
        this.showTable = this.config.showTables;
        var self = this;
        this.replacers = this.loadReplacements(response => {
            self.replacements = JSON.parse(response);
        });
        this.sendSocketNotification('GET_HANDBALL_DATA', this.config);
        this.scheduleDOMUpdates();
    },


    loadReplacements: function(callback) {
        this.log("Loading replacements file");
        var xobj = new XMLHttpRequest();
        var path = this.file('replacements.json');
        xobj.overrideMimeType("application/json");
        xobj.open("GET", path, true);
        xobj.onreadystatechange = function() {
            if (xobj.readyState === 4 && xobj.status === 200) {
                callback(xobj.responseText);
            }
        };
        xobj.send(null);
    },


    scheduleDOMUpdates: function () {
        var count = 0;
        var self = this;
        setInterval(() => {
            const comps = self.leagues.length;
            count = (count >= comps - 1) ? 0 : count + 1;
            self.competition = self.leagues[count];
            self.log("Showing competition: " + self.competition);
            //self.log(self.tables[self.competition]);
            self.standing = self.filterTables(self.tables[self.competition], self.config.focus_on[self.competition]);
            self.updateDom(500);
        }, this.config.updateInterval * 1000);
    },


    socketNotificationReceived: function(notification, payload) {
        this.log(`received a Socket Notification: ${notification}`);
        if (notification === 'TABLES') {
            //this.log(payload);
            this.tables = payload;
            this.standing = this.filterTables(this.tables[this.competition], this.config.focus_on[this.competition]);
            //this.log("Current table: " + JSON.stringify(this.standing));
        } else if (notification === 'MATCHES') {
            this.matches = payload;
            this.log("Received matches: ");
            //this.log(this.matches);
        } else if (notification === 'TEAMS') {
            this.teams = payload;
        /*} else if (notification === 'LIVE_MATCHES') {
            var matches = payload;*/
        } else if (notification === 'LIVE') {
            this.liveMode = payload.live;
            this.leagues = (payload.leagues.length > 0) ? payload.leagues : this.config.show;
            this.liveMatches = payload.matches;
        }
        if (this.loading === true && this.tables.hasOwnProperty(this.competition) && this.matches.hasOwnProperty(this.competition)) {
            this.loading = false;
            this.updateDom();
        }
    },

    notificationReceived: function(notification, payload, sender) {
        if (notification === 'ALL_MODULES_STARTED') {
            const voice = Object.assign({}, this.voice);
            voice.sentences.push(Object.keys(this.config.leagues).join(' '));
            this.sendNotification('REGISTER_VOICE_MODULE', voice);
        } else if (notification === 'VOICE_HANDBALL' && sender.name === 'MMM-voice') {
            this.checkCommands(payload);
        } else if (notification === 'VOICE_MODE_CHANGED' && sender.name === 'MMM-voice' && payload.old === this.voice.mode) {
            this.closeAllModals();
            this.updateDom(500);
        }
    },

    getStyles: function() {
        return ['MMM-handball-netz.css'];
    },

    getTranslations: function() {
        return {
            en: 'translations/en.json',
            de: 'translations/de.json',
            id: 'translations/id.json',
            sv: 'translations/sv.json',
            fr: 'translations/fr.json'
        };
    },

    getTemplate: function() {
        return 'MMM-handball-netz.njk';
    },


    getTemplateData: function() {
		
		var params = this.competition.split('#');
		var sourceURL = "https://www.handball.net/ligen/"+ params[0] +"/tabelle?";
		var phase = params.length > 1 ? params[1] :"";
		if (phase) sourceURL = sourceURL + "phase=" + phase;

        return {
            boundaries: (this.tables.hasOwnProperty(this.competition)) ? this.calculateTeamDisplayBoundaries(this.competition) : {},
            matchHeader: this.getMatchHeader(),
            config: this.config,
            isModalActive: this.isModalActive(),
            modals: this.modals,
            table: this.standing,
            comps: (Object.keys(this.matches).length > 0) ? this.prepareMatches(this.matches, this.config.focus_on[this.competition]) : "",
			showTable: this.showTable,
            teams: (Object.keys(this.tables).length > 0) ? this.teams : {},
            showMatchDay: this.config.showMatchDay,
			sourceURL : sourceURL,
            voice: this.voice
        };
    },

    getMatchHeader: function() {
        if (this.config.matchType == "daily") {
            return {
                competition: this.translate('TODAYS_MATCHES'),
                season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
            }
        } else if (this.config.matchType == "next") {
            return {
                competition: this.translate('NEXT_MATCHES'),
                season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
            }
        }
		var competionName = (Object.keys(this.tables).length > 0) ? this.tables[this.competition].competition.name : "";
		var phaseName = (Object.keys(this.tables).length > 0) ? this.tables[this.competition].competition.phaseName : "";
        
		return {
            competition: (phaseName && phaseName.includes(competionName)) ? phaseName : competionName,
			phase: (competionName && competionName.includes(phaseName)) ? "" : (phaseName && phaseName.includes(competionName) ? "":phaseName ),
            season: (Object.keys(this.tables).length > 0) ? `${this.translate('MATCHDAY')}: ${this.translate(this.matchDay)}` : this.translate('LOADING'),
        }
		/*
        return {
            competition: (Object.keys(this.tables).length > 0) ? this.tables[this.competition].competition.name : "",
			phase: (Object.keys(this.tables).length > 0) ? this.tables[this.competition].competition.phaseName : "",
            season: (Object.keys(this.tables).length > 0) ? `${this.translate('MATCHDAY')}: ${this.translate(this.matchDay)}` : this.translate('LOADING'),
        }
		*/
    },


    prepareMatches: function(allMatches, focusTeam) {
        var returnedMatches = [];	
		var currentMatchWeek;
		//this.matchDay = moment().isoWeek();
		var matchDays = [];
		
        if (this.config.matchType === 'league') {
            var diff = 0;
            var matches = allMatches[this.competition].matches;
			// getting the Name of the "phase" because it's not availabe in standings "
			var phaseName = (matches.length > 0) ? matches[0].phase.name: "" ; 
			var competionName = (matches.length > 0) ? matches[0].tournament.name: "" ;
            matches[0].tournament.name = (phaseName && phaseName.includes(competionName)) ? phaseName : competionName;
			phaseName = (competionName && competionName.includes(phaseName)) ? "" : (phaseName && phaseName.includes(competionName) ? "":phaseName );

			/* not needed anymore
			var firstMatch = matches.filter(match => {
                    return moment(match.startsAt).isoWeek() == this.matchDay;
                });
			*/
            //hnet: matchDatetime Field: startsAt !
			var providedWeeks=[];
			var weekMap = new Map();
			var weekArray = [];
			let i = 0;
            var minDiff = Math.abs(moment().diff(matches[0].startsAt));
			var minStartAs = matches[0].startsAt;

            for (var m = 0; m < matches.length; m++) {
                //if (!matches[m].matchday) { matches[m].matchday = matches[m].stage; }  //for cup modes, copy stage to matchday property
                // not needed for week based Leagues !
                diff = Math.abs(moment().diff(matches[m].startsAt));
                if (diff < minDiff) {
                    minDiff = diff;
					minStartAs = matches[m].startsAt;
                }
				currentMatchWeek = moment(matches[m].startsAt).isoWeek();
				weekArray.push({kw:currentMatchWeek,gameCount:0});
				
				if(weekMap.has(currentMatchWeek)) {
					weekMap.set(currentMatchWeek , weekMap.get(currentMatchWeek) + 1);  // one more game in week
				} else {
					weekMap.set(currentMatchWeek,1);
				}
            }
			this.matchDay = moment(minStartAs).isoWeek() ;
			matchDays.push(this.matchDay);
			/* TOdo: wenn in der aktuellen KM weniger als 4 Spiele ausgetragen werden,
				soll die Spiele der nächsten KW mit ausgegeben werden.
				Also brauch ich den aktuellen index der weekMap um mit index +1 den nächsten zu bekommen ?
			
			if (weekMap.get(this.matchDay) < 4 ) {
				this.log("Spiele in KW " + weekMap.get(this.matchDay));
				const arr = [...weekMap];

				const getPrevAndNext = (activeID) => {
				  const index = arr.findIndex((a) => a.Id === activeID)
				  if (index === -1) {
					return undefined
				  }
				  
				  const prev = arr[index - 1]
				  if (!prev) {
					return undefined
				  }
				  
				  const next = arr[index + 1]
				  if (!next) {
					return undefined
				  }
				  
				  return [prev, next]
				}

			}
			*/
			
            this.showTable = (!isNaN(this.matchDay));
    	    returnedMatches.push({
                competition: (Object.keys(this.tables).length > 0) ? this.tables[this.competition].competition.name : "", // String for the Template
				//phase: (Object.keys(this.tables).length > 0 & firstMatch.length > 0 )  ? "Hallo " + firstMatch[0].phase.name:"", // String for the Template
				// Sometimes competition.name is equal to phase.name , in this case do not show the phase.name
				phase: (Object.keys(this.tables).length > 0 && this.tables[this.competition].competition.name != phaseName )  ? phaseName:"", // String for the Template
                emblem: (Object.keys(this.tables).length > 0) ? this.tables[this.competition].competition.emblem : "",
                // ToDo !!! season: (Object.keys(this.tables).length > 0) ? `${this.translate('MATCHDAY')}: ${this.translate(this.matchDay)}` : this.translate('LOADING'),
                season: (Object.keys(this.tables).length > 0) ? '' : this.translate('LOADING'), // String for the Template
                matches: matches.filter(match => { 
//                    return moment(match.startsAt).isoWeek() == this.matchDay;
                    return matchDays.includes(moment(match.startsAt).isoWeek() ); 
                })
            });
		// Todo: the this.config.matchType === 'next is not tested !!!
        } else if (this.config.matchType === 'next') {
            var teams = [];
            var nextMatches = [];
            for (var comp in this.config.focus_on) {
                teams.push(this.config.focus_on[comp]);
            }
            for (var league in allMatches) {
                filteredMatches = allMatches[league].matches.filter(match => {
                    return (teams.includes(match.homeTeam.name) || teams.includes(match.awayTeam.name));
                });
                var index = filteredMatches.findIndex(match => {
                    return (parseInt(moment(match.startsAt).format("X")) > parseInt(moment().format("X")));
                });
                for (var i = index - 1; i < filteredMatches.length; i++) {
                    nextMatches.push(filteredMatches[i]);
                }
            }
            nextMatches.sort(function (match1, match2) {
                return (moment(match1.startsAt) - moment(match2.startsAt));
            });
            returnedMatches.push({
                competition: this.translate('NEXT_MATCHES'),
                season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
                matches: nextMatches.slice(0, this.config.numberOfNextMatches)
            });

		// Todo: the this.config.matchType === 'daily is not tested !!!
        } else if (this.config.matchType === 'daily') {
            var today = moment().subtract(this.config.daysOffset, 'days');
            var todaysMatches = [];
            for (var league in allMatches) {
                var filteredMatches = allMatches[league].matches.filter(match => {
                    return ( moment(match.startsAt).isSame(today, 'day') );
                });
                this.log("Filtered matches: ");
                this.log(filteredMatches);
                if (filteredMatches.length) {
                    returnedMatches.push({
                        competition: (Object.keys(this.tables).length > 0) ? this.tables[league].competition.name : "",
                         season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
                        matches: filteredMatches
                    });
                }
            }
            /*todaysMatches = todaysMatches.flat();
            todaysMatches.sort(function (match1, match2) {
                return (match1.season.id - match2.season.id);
            });
            returnedMatches.push({
                competition: this.translate('TODAYS_MATCHES'),
                season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
                matches: todaysMatches
            });*/
        }
        returnedMatches.forEach(matchset => {
            matchset.matches.forEach(match => {
                if (this.config.matchType == "league" || this.config.matchType == "daily") {
                    match.focused = (match.homeTeam.name === focusTeam) ? true : (match.awayTeam.name === focusTeam) ? true : false;
                }
				// Achtung state = Post,Pre,Live  
				match.status = match.state; // Bei Hnet ist der Status im attribute state
				// if (match.status == "TIMED" || match.status == "SCHEDULED" || match.status == "POSTPONED") {
                // hnet stati = "Post" , "Pre" oder "Live")
                if (match.status == "Pre" ||   !match.homeGoals || !match.awayGoals ) { 
//                    match.state = (moment(match.startsAt).diff(moment(), 'days') > 7) ? moment(match.startsAt).format("D.MM.") : (moment(match.startsAt).startOf('day') > moment()) ? moment(match.startsAt).format("dd HH:mm") : moment(match.startsAt).format("LT");
                    match.state = (moment(match.startsAt).diff(moment(), 'days') > 5) ? moment(match.startsAt).format("dd D.MM.") : (moment(match.startsAt).startOf('day') > moment()) ? moment(match.startsAt).format("dd HH:mm") : moment(match.startsAt).format("LT");
               } else {
                    //match.state = match.score.fullTime.home + " - " + match.score.fullTime.away;
					match.state = match.homeGoals + " - " + match.awayGoals;
                    if (match.homeGoals > match.awayGoals) {
                        match.homeTeam["status"] = "winner"
                    } else if (match.homeGoals < match.awayGoals) {
                        match.awayTeam["status"] = "winner"
                   }
                }
            });
        });
        return returnedMatches;
    },


    filterTables: function(tables, focusTeam) {
        //filtering out "home" and "away" tables
        if (tables && !tables.standings) return "";
        tableArray = tables.standings.filter(table => {
            return table.type === "TOTAL";
        });
        if (tableArray[0].group === "GROUP_A" && this.config.focus_on.hasOwnProperty(tables.competition.code)) {			//cup mode
            for (var t = 0; t < tableArray.length; t++) {
                for (var n = 0; n < tableArray[t].table.length; n++) {
                    if (tableArray[t].table[n].team.name === focusTeam) {
                        table = tableArray[t].table;
                    }
                }
            }
        } else {
            table = tableArray[0].table;
        }
        return table;
    },


    findFocusTeam: function() {
        this.log("Finding focus team for table...");
        let focusTeamIndex = -1;
        var table = this.standing;
        for (let i = 0; i < table.length; i ++) {
            if (table[i].team.name === this.config.focus_on[this.competition]) {
                focusTeamIndex = i;
                this.log("Focus Team found: " + table[i].team.name);
                break;
            }
        }

        if (focusTeamIndex < 0) {
            this.log("No Focus Team found! Please check your entry!");
            return {
                focusTeamIndex: -1,
                firstTeam: 0,
                lastTeam: this.config.max_teams || this.standing.length
            };
        } else {
            const { firstTeam, lastTeam } = this.getFirstAndLastTeam(focusTeamIndex);
            return { focusTeamIndex, firstTeam, lastTeam };
        }
    },


    getFirstAndLastTeam: function(index) {
        let firstTeam;
        let lastTeam;

        if (this.config.max_teams) {
            const before = parseInt(this.config.max_teams / 2);
            firstTeam = (index - before >= 0) ? (index - before) : 0;
            if (firstTeam + this.config.max_teams <= this.standing.length) {
                lastTeam = firstTeam + this.config.max_teams;
            } else {
                lastTeam = this.standing.length;
                /*firstTeam = lastTeam - this.config.max_teams >= 0 ?
                    lastTeam - this.config.max_teams : 0;*/
            }
        } else {
            firstTeam = 0;
            lastTeam = this.standing.length;
        }
		if (firstTeam<2) firstTeam = 0;  // Show Top of Table if pos = 2;

        this.log({firstTeam, lastTeam});
        return { firstTeam, lastTeam };
    },


    calculateTeamDisplayBoundaries: function(competition) {
        this.log("Calculating Team Display Boundaries");
        if (this.config.focus_on && this.config.focus_on.hasOwnProperty(competition)) {
            if (this.config.focus_on[competition] === 'TOP') {
                this.log("Focus on TOP");
                return {
                    focusTeamIndex: -1,
                    firstTeam: 0,
                    lastTeam: this.isMaxTeamsLessAll() ? this.config.max_teams : this.standing.length
                };
            } else if (this.config.focus_on[this.leagues] === 'BOTTOM') {
                this.log("Focus on BOTTOM");
                return {
                    focusTeamIndex: -1,
                    firstTeam: this.isMaxTeamsLessAll() ? this.standing.length - this.config.max_teams : 0,
                    lastTeam: this.standing.length
                };
            }
            this.log("Focus on Team");
            return this.findFocusTeam();
        }

        return {
            focusTeamIndex: -1,
            firstTeam: 0,
            lastTeam: this.config.max_teams || this.standing.length
        };
    },



    isMaxTeamsLessAll: function() {
        return (this.config.max_teams && this.config.max_teams <= this.standing.length);
    },


    handleModals: function(data, modal, open, close) {
        if (close.test(data) || (this.modals[modal] && !open.test(data))) {
            this.closeAllModals();
        } else if (open.test(data) || (!this.modals[modal] && !close.test(data))) {
            this.closeAllModals();
            this.modals[modal] = true;
        }

        const modules = document.querySelectorAll('.module');
        for (let i = 0; i < modules.length; i += 1) {
            if (!modules[i].classList.contains('MMM-handball-netz')) {
                if (this.isModalActive()) {
                    modules[i].classList.add('MMM-handball-netz-blur');
                } else {
                    modules[i].classList.remove('MMM-handball-netz-blur');
                }
            }
        }
    },


    closeAllModals: function() {
        const modals = Object.keys(this.modals);
        modals.forEach((modal) => { this.modals[modal] = false; });
    },


    isModalActive: function() {
        const modals = Object.keys(this.modals);
        return modals.some(modal => this.modals[modal] === true);
    },


    checkCommands: function(data) {
        if (/(HELP)/g.test(data)) {
            this.handleModals(data, 'help', /(OPEN)/g, /(CLOSE)/g);
        } else if (/(VIEW)/g.test(data)) {
            this.handleModals(data, 'standings', /(EXPAND)/g, /(COLLAPSE)/g);
        } else if (/(STANDINGS)/g.test(data)) {
            const countrys = Object.keys(this.config.leagues);
            for (let i = 0; i < countrys.length; i += 1) {
                const regexp = new RegExp(countrys[i], 'g');
                if (regexp.test(data)) {
                    this.closeAllModals();
                    if (this.currentLeague !== this.config.leagues[countrys[i]]) {
                        this.currentLeague = this.config.leagues[countrys[i]];
                        this.getData();
                    }
                    break;
                }
            }
        }
        this.updateDom(300);
    },


    addFilters: function () {
        njEnv = this.nunjucksEnvironment();
        njEnv.addFilter('fade', (index, focus) => {
            if (this.config.max_teams && this.config.fadeFocus && focus >= 0) {
                if (index !== focus) {
                    const currentStep = Math.abs(index - focus);
                    return `opacity: ${1 - ((1 / this.config.max_teams) * currentStep)}`;
                }
            }
            return '';
        });
		
        njEnv.addFilter('replace', (team) => {

			// Extract Teamnumber from Teamname to find replacments for all Teams of a club.
			// So there is no need to add all Teams in the replacments.json File
			// Example Entry:	"JSG Handball Löhne-Mennighüffen-Obernbeck":"JSG Handball LöhMeOb",
			// Will also replace SG Handball Löhne-Mennighüffen-Obernbeck 3 => JSG Handball LöhMeOb 3 and so on.
	
            var replace = this.config.replace;
			const regex = /(.*)( [1-9]| I{1,3}V{0,1}I{0,3})$/gm;  // (.*)=Teamname ( [1-9]=space+Teamnumber|IV=space+RomanNumbers)
			let m;
			let club = null;
			let teamNumber = null;
			team = team.trim();  // Sometimes Teamname with tailing whitespace occures and replacments won't work. So kick them!
			while ((m = regex.exec(team)) !== null) {
				// This is necessary to avoid infinite loops with zero-width matches
				if (m.index === regex.lastIndex) {
					regex.lastIndex++;
				}			
				// The result can be accessed through the `m`-variable.
				m.forEach((match, groupIndex) => {
					//console.log(`Found match, group ${groupIndex}: ${match}`);
					if(groupIndex == 1) club = match;
					if(groupIndex == 2) teamNumber = match;
				});
			}
			// Return the found replacment for the Team 
			if ((replace == "default" || replace == "short") && club && (this.replacements.default.hasOwnProperty(club))) {			
                return this.replacements[replace][club] + teamNumber;
            }		
            else if ((replace == "default" || replace == "short") && (this.replacements.default.hasOwnProperty(team))) {
                return this.replacements[replace][team];
            } 	
			else {
                return team;
            }
        });
    },

    log: function (msg) {
        if (this.config && this.config.debug) {
            console.log(this.name + ":", JSON.stringify(msg));
        }
    },
});
