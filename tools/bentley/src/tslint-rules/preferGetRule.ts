// ====================================================================================================================
/**
 * This rule enforces the use of get-accessors in place of methods for functions starting with "is", "has", or "want",
 * such that they may be accessed as properties of the object.
 */
// ====================================================================================================================
import * as ts from "typescript";
import * as Lint from "tslint";

export class Rule extends Lint.Rules.AbstractRule {
  public static FAILURE_STRING: string = "use a get-accessor for this method based on its name";

  public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
    return this.applyWithWalker(
      new PreferGetWalker(sourceFile, this.getOptions()),
    );
  }
}

class PreferGetWalker extends Lint.RuleWalker {
  // override
  public visitMethodDeclaration(node: ts.MethodDeclaration) {
    if (node.parameters.length !== 0)
      return;
    if (this.isPrivate(node))
      return;

    const name = node.name.getText();
    if (this.hasGetterName(name)) {
      this.addFailureAtNode(node, Rule.FAILURE_STRING);
    }
  }

  private isPrivate(node: ts.MethodDeclaration): boolean {
    if (node.modifiers === undefined)
      return false;
    for (const modifier of node.modifiers) {
      const modText = modifier.getText();
      if (modText === "private")
        return true;
    }
    return false;
  }

  private hasGetterName(name: string): boolean {
    if ((name.length > 2 && name.slice(0, 2) === "is" && name.charAt(2) === name.charAt(2).toUpperCase()) ||
      (name.length > 3 && name.slice(0, 3) === "has" && name.charAt(3) === name.charAt(3).toUpperCase()) ||
      (name.length > 4 && name.slice(0, 4) === "want" && name.charAt(4) === name.charAt(4).toUpperCase())) {
      return true;
    }
    return false;
  }
}
