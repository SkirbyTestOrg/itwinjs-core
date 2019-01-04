/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as bodyParser from "body-parser";
import * as express from "express";
import { QueryAgent } from "./QueryAgent";
import { QueryAgentConfig } from "./QueryAgentConfig";
import { AccessToken } from "@bentley/imodeljs-clients";
import { OpenIdConnectTokenStore } from "./OpenIdConnectTokenStore";
import * as passport from "passport";
import * as session from "express-session";

/** Container class for web server and the iModelJS backend run in the QueryAgent */
export class QueryAgentWebServer {
    private _server: any;
    private _agent: QueryAgent;

    public constructor(app: express.Express, agent: QueryAgent = new QueryAgent()) {
        this._agent = agent;
        // Enable CORS for all apis
        app.all("/*", (_req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "POST, GET");
            res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-Correlation-Id");
            next();
        });

        // parse application/x-www-form-urlencoded
        app.use(bodyParser.urlencoded({
            extended: false,
        }));

        this.setupAuthRoutes(app);

        app.get("/ping", (_request, response) => response.status(200).send("Success"));

        app.set("port", QueryAgentConfig.port);
    }

    public async start(app: express.Express) {
        // tslint:disable-next-line:no-console
        this._server = app.listen(app.get("port"), () => console.log("iModel Query Agent listening on http://localhost:" + app.get("port")));
    }

    private setupAuthRoutes(app: express.Express) {
        app.use(session({
            secret: "foo",
            resave: false,
            saveUninitialized: true,
            cookie: {
                secure: false,
            },
        }));

        app.use(passport.initialize());
        app.use(passport.session());

        passport.serializeUser((user, done) => {
            done(null, user);
        });

        passport.deserializeUser((user, done) => {
            done(null, user);
        });

        app.get("/login", passport.authenticate("oidc"));

        const isLoggedIn = (req: any, res: any, next: any) => {
            if (req.isAuthenticated()) {
                console.log("Is authenticated"); // tslint:disable-line:no-console
                return next();
            }
            console.log("Not Authenticated"); // tslint:disable-line:no-console
            res.redirect("/login");
        };

        app.get("/start", isLoggedIn, async (_request, response) => {
            response.status(200).send("iModel-query-agent: Logged in. See console for the output created by the sample");
            await this.run();
        });

        app.get("/loginFailure", async (_request, response) => {
            response.status(401).send(`iModel-query-agent: Error logging in`);
        });

        app.get("/signin-oidc", passport.authenticate("oidc", { successRedirect: "/start", failureRedirect: "/loginFailure" }));
        app.post("/signin-oidc", passport.authenticate("oidc", { successRedirect: "/start", failureRedirect: "/loginFailure" }));

        app.get("/logout", (req, res) => {
            req.logout();
            this.clearSession();
            res.redirect("/");
        });

        app.get("/", (req, res) => {
            if (req.isAuthenticated())
                res.redirect("/start");
            else
                res.redirect("/login");
        });
    }

    private _tokenStore?: OpenIdConnectTokenStore;

    private clearSession() {
        this._tokenStore = undefined;
    }

    public async run(): Promise<boolean> {
        if (!this._tokenStore)
            throw new Error("Error getting the access tokens and user profile. Perhaps the user hasn't logged in");

        const accessToken: AccessToken = await this._tokenStore.getAccessToken();
        console.log(accessToken); // tslint:disable-line:no-console

        // Initialize the iModelJS backend sitting behind this web server
        try {
            await this._agent.listenForAndHandleChangesets(this._tokenStore, QueryAgentConfig.listenTime);
        } catch (error) {
            return false;
        }
        return true;
    }

    public close(): void {
        try {
            this._server.close();
            this.clearSession();
        } catch (error) {
        }
    }
}

/*
 * Needs discussion -
 * Use of implicit workflow for SPA (issues: short lived access tokens, sending token to multiple servers, and using access token in front end)
 *
 * Minimum required before push -
 *   + Electron setup.
 *   + Mobile setup.
 *   + Hook up accessToken into entire workflow - need to extract TokenStore to avoid circular references.
 *   + Figure use of react-oidc in ui-test-app
 *   + Get suite of integration tests to work
 *      - Tests are currently broken - fix the issues there first.
 *      - Provide a way for silent login
 *   + Test that refresh tokens work by getting the correct access tokens.
 *   + Worry about the navigator use case before switching AccessTokens to use OIDC. (need a mechanism to allow navigator to fetch SAML tokens)
 *
 * Beyond push -
 *   + Figure why getting extended profile information doesn't work.
 *   + Consider persisting the session to avoid a login when the server restarts.
 *   + Setup better UI for logging in the user (this would be the future "deployment" mechanism of the agent).
 *   + Setup and debug use of certificates.
 *   + Improve oidc-client typedefinition - type more constructs (search and replace any use of "any")
 */
