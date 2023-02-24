import React from "react";
import Another from "./another";

describe("<Another />", () => {
  it("renders", () => {
    // see: https://on.cypress.io/mounting-react
    cy.mount(<Another />);
    cy.contains("Another Page");
  });
});
