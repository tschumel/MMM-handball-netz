/**
 * @file MMM-soccer.js
 *
 * @author lavolp3/fewieden
 * @license MIT
 *
 * @see  https://github.com/lavolp3/MMM-soccer
 */

/* jshint esversion: 6 */

/* global Module Log */

Module.register('MMM-soccer', {

    defaults: {
        api_key: false,
        colored: false,
      	width: 400,
        show: ['BL1'],//['BL1', 'CL', 'PL'],
        updateInterval: 10,
        apiCallInterval: 2 * 60,
        focus_on: false,
        fadeFocus: true,
        max_teams: false,
        logos: true,
        showTables: true,
        showMatches: true,
        showDetails: true,
        showMatchDay: true,
        matchType: 'league',    //choose 'next', 'daily', or 'league'
        numberOfNextMatches: 8,
        leagues: {
            BL1: 35,
            BL2: 44,
            BL3: 491,
            DFB: 9,
            CL: 1,
            PL: 9,
            FAC: 19,
            SPD: 8,
            SSD: 54,
            ISA: 23,
            ISB: 53,
            CPI: 328,
            FL1: 34,
            FL2: 182,
            ABL: 45,
            AEL: 135,
            NED: 37
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
        mode: 'SOCCER',
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
    leaguesList: [],
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
            //self.log(self.replacements);
        });
        this.sendSocketNotification('GET_SOCCER_DATA', this.config);
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
            count = (count + 1) % self.leagues.length;
            self.competition = self.leagues[count];
            self.log("Showing competition: " + self.competition);
            self.standing = self.tables[self.competition].table[0].table;//self.filterTables(self.tables[self.competition], self.config.focus_on[self.competition]);
            //self.log(self.standing);
            self.updateDom(500);
        }, this.config.updateInterval * 1000);
    },


    socketNotificationReceived: function(notification, payload) {
        this.log(`received a Socket Notification: ${notification}`);
        if (notification === 'TABLE') {
            this.log(payload);
            var league = Object.keys(this.config.leagues).find(key => this.config.leagues[key] == payload.leagueId);
            this.tables[league] = payload;
            console.log(this.tables);
            this.standing = this.tables[this.competition].table[0].table;//this.filterTables(this.tables[this.competition], this.config.focus_on[this.competition]);
            //this.log("Current table: " + this.standing);
        } else if (notification === 'STANDINGS') {
            this.log(payload);
            var league = Object.keys(this.config.leagues).find(key => this.config.leagues[key] == payload.leagueId);
            this.matches[league] = this.processMatches(payload.standings.data);
            this.log("Received matches!")
            this.log(this.matches);
        } else if (notification === 'LEAGUES') {
            this.log(payload);
            this.leaguesList = payload
            this.log("Received leagues!")
            this.log(this.leaguesList);
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
            //this.updateDom();
        }
    },

    notificationReceived: function(notification, payload, sender) {
        if (notification === 'ALL_MODULES_STARTED') {
            const voice = Object.assign({}, this.voice);
            voice.sentences.push(Object.keys(this.config.leagues).join(' '));
            this.sendNotification('REGISTER_VOICE_MODULE', voice);
        } else if (notification === 'VOICE_SOCCER' && sender.name === 'MMM-voice') {
            this.checkCommands(payload);
        } else if (notification === 'VOICE_MODE_CHANGED' && sender.name === 'MMM-voice' && payload.old === this.voice.mode) {
            this.closeAllModals();
            this.updateDom(500);
        }
    },

    getStyles: function() {
        return ['MMM-soccer.css'];
    },

    getTranslations: function() {
        return {
            en: 'translations/en.json',
            de: 'translations/de.json',
            id: 'translations/id.json',
            sv: 'translations/sv.json'
        };
    },

    getTemplate: function() {
        return 'MMM-soccer.njk';
    },


    getTemplateData: function() {
        return {
            boundaries: (this.tables.hasOwnProperty(this.competition)) ? this.calculateTeamDisplayBoundaries(this.competition) : {},
            matchHeader: this.getMatchHeader(),
            config: this.config,
            isModalActive: this.isModalActive(),
            modals: this.modals,
            table: this.standing,
            leagues: this.leaguesList,
            comps: (Object.keys(this.matches).length > 0) ? this.prepareMatches(this.matches, this.config.focus_on[this.competition]) : "",
            showTable: this.showTable,
            teams: (Object.keys(this.tables).length > 0) ? this.teams : {},
            showMatchDay: this.config.showMatchDay,
            voice: this.voice
        };
    },
    
    processMatches: function (data) {
        var matches = [];
        for (let i  = 0; i < data.length; i++) {
            var time = moment(data[i].time, 'X');
            for (let m = 0; m < data[i].matches.length; m++) {
                var match = data[i].matches[m];
                matches.push({
                    homeTeam: {
                        name: match.team1_name,
                        id: match.team1_id,
                        goals: match.team1_goals,
                    },
                    awayTeam: {
                        name: match.team2_name,
                        id: match.team2_id,
                        goals: match.team2_goals,
                    },
                    status: match.status,
                    time: data[i].time,
                    round: data[i].round_text,
                    scorers: "",
                    state: this.getState(match, time),
                });
                if (match.details) {
                    for (let d = 0; d < match.details.length; d++) {
                        matches[matches.length-1].scorers += "<b>" + match.details[d].minute + "\'</b> " + match.details[d].team1_goals + "-" + match.details[d].team2_goals + " " + match.details[d].event_text + " | "
                    }
                };
            }
        }
        return matches;
    },
    
    getState: function(match, time) {
        return (time.diff(moment(), 'minutes') < 0) ? match.team1_goals + "-" + match.team2_goals
            : (time.diff(moment(), 'days') > 7) ? time.format("D.MM.") 
            : (time.clone().startOf('day') > moment()) ? time.format("dd") 
            : time.format("LT")
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
        return {
            competition: (Object.keys(this.tables).length > 0) ? this.competition : "",
            season: (Object.keys(this.tables).length > 0) ? `${this.translate('MATCHDAY')}: ${this.matchDay}` : this.translate('LOADING'),
        }
    },


    prepareMatches: function(allMatches, focusTeam) {
        this.log("Preparing matches...");
        var returnedMatches = [];
        this.log(this.config.matchType);
        if (this.config.matchType == 'league') {
            this.log(allMatches[this.competition]);
            var matches = allMatches[this.competition];
            this.matchDay = allMatches[this.competition][0].round;
            this.log("Current matchday: " + this.matchDay);
            //this.showTable = (!isNaN(this.matchDay));
    	    returnedMatches.push({
                competition: this.leaguesList[this.config.leagues[this.competition]].name || "Unknown",
                season: (Object.keys(this.tables).length > 0) ?  `${this.translate('MATCHDAY')}: ${this.matchDay}` : this.translate('LOADING'),
                matches: matches
            });
            this.log("Returned matches:");
            this.log(returnedMatches);
            return returnedMatches;
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
                    return (parseInt(moment(match.utcDate).format("X")) > parseInt(moment().format("X")));
                });
                for (var i = index - 1; i < filteredMatches.length; i++) {
                    nextMatches.push(filteredMatches[i]);
                }
            }
            nextMatches.sort(function (match1, match2) {
                return (moment(match1.utcDate) - moment(match2.utcDate));
            });
            returnedMatches.push({
                competition: this.translate('NEXT_MATCHES'),
                season: (Object.keys(this.tables).length > 0) ? "" : this.translate('LOADING'),
                matches: nextMatches.slice(0, this.config.numberOfNextMatches)
            });

        } else if (this.config.matchType === 'daily') {
            var today = moment().subtract(this.config.daysOffset, 'days');
            var todaysMatches = [];
            for (var league in allMatches) {
                var filteredMatches = allMatches[league].matches.filter(match => {
                    return ( moment(match.utcDate).isSame(today, 'day') );
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
        /*
        returnedMatches.forEach(matchset => {
            matchset.matches.forEach(match => {
                if (this.config.matchType == "league" || this.config.matchType == "daily") {
                    match.focused = (match.homeTeam.name.indexOf(focusTeam)) > -1 ? true : (match.awayTeam.name.indexOf(focusTeam) > -1) ? true : false;
                }
                
                //moment(match.period_time("X"))
                if (match.status == "SCHEDULED" || match.status == "POSTPONED") {
                    match.state = (moment(match.utcDate).diff(moment(), 'days') > 7) ? moment(match.utcDate).format("D.MM.") : (moment(match.utcDate).startOf('day') > moment()) ? moment(match.utcDate).format("dd") : moment(match.utcDate).format("LT");
                } else {
                    match.state = match.score.fullTime.homeTeam + " - " + match.score.fullTime.awayTeam;
                    if (match.score.winner == "HOME_TEAM") {
                        match.homeTeam["status"] = "winner"
                    } else if (match.score.winner == "AWAY_TEAM") {
                        match.awayTeam["status"] = "winner"
                   }
                }
            });
        });*/
    },


    filterTables: function(tables, focusTeam) {
        //filtering out "home" and "away" tables
        if (tables && !tables.standings) return "";
        tableArray = tables.standings.filter(table => {
            return table.type === "TOTAL";
        });
        if (tableArray[0].group === "GROUP_A" && this.config.focus_on.hasOwnProperty(tables.competition.code)) {  //cup mode
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
            if (table[i].team_name.indexOf(this.config.focus_on[this.competition]) != -1) {
                focusTeamIndex = i;
                this.log("Focus Team found: " + table[i].team_name);
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
            if (!modules[i].classList.contains('MMM-soccer')) {
                if (this.isModalActive()) {
                    modules[i].classList.add('MMM-soccer-blur');
                } else {
                    modules[i].classList.remove('MMM-soccer-blur');
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
                    return `opacity:${1 - ((1 / this.config.max_teams) * currentStep)};`;
                }
            }
            return '';
        });

        njEnv.addFilter('replace', (team) => {
            var replace = this.config.replace;
            if ((replace == 'default' || replace == 'short') && (this.replacements.default.hasOwnProperty(team))) {
                return this.replacements[replace][team];
            } else {
                return team;
            }
        });
    },

    log: function (msg) {
        if (this.config && this.config.debug) {
            console.log(this.name + "[" + moment().format("HH:mm:ss") + "]:", JSON.stringify(msg));
        }
    },
});
