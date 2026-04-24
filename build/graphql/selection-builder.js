"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphQLSelectionBuilder = void 0;
/**
 * Builder class for constructing GraphQL selection queries.
 * Merges multiple domain selections into a single optimized query.
 * Optionally filters fields marked with `requiresCapability` against
 * the supplied capability flags.
 */
class GraphQLSelectionBuilder {
    capabilities;
    roots = new Map();
    /**
     * Create a new selection builder
     *
     * @param capabilities - Optional capability flags. Fields with a
     *   `requiresCapability` attribute will be omitted if the flag is false.
     *   If omitted, all fields pass through (backwards compatible).
     */
    constructor(capabilities) {
        this.capabilities = capabilities;
    }
    /**
     * Add multiple root selections to the query builder
     *
     * @param selections - Array of root selections to add
     */
    addSelections(selections) {
        for (const selection of selections) {
            if (!selection.fields.length) {
                continue;
            }
            if (!this.capabilityAllows(selection.requiresCapability)) {
                continue;
            }
            const rootNode = this.getOrCreateRoot(selection.root);
            this.addFields(rootNode, selection.fields);
        }
    }
    /**
     * Check whether a capability-gated element should be included.
     *
     * @param capability - Optional capability key guarding the element
     * @returns true when no gate exists, or when the gate is satisfied
     */
    capabilityAllows(capability) {
        if (!capability) {
            return true;
        }
        if (!this.capabilities) {
            // No capabilities supplied → default to including everything
            return true;
        }
        return Boolean(this.capabilities[capability]);
    }
    /**
     * Build the complete GraphQL query string
     *
     * @returns The formatted GraphQL query or null if no selections
     */
    build() {
        if (!this.roots.size) {
            return null;
        }
        const sections = [];
        const sortedRoots = Array.from(this.roots.keys()).sort((left, right) => left.localeCompare(right));
        for (const root of sortedRoots) {
            const node = this.roots.get(root);
            if (!node) {
                continue;
            }
            const body = this.printNode(node, 8);
            const section = body ? `    ${root} {\n${body}\n    }` : `    ${root}`;
            sections.push(section);
        }
        const queryBody = sections.join('\n');
        return `query UnraidAdapterFetch {\n${queryBody}\n}`;
    }
    /**
     * Get or create a root node in the selection tree
     *
     * @param root - Name of the root field
     * @returns The field node for the root
     */
    getOrCreateRoot(root) {
        const existing = this.roots.get(root);
        if (existing) {
            return existing;
        }
        const node = new Map();
        this.roots.set(root, node);
        return node;
    }
    /**
     * Recursively add field specifications to a target node
     *
     * @param target - Target node to add fields to
     * @param fields - Field specifications to add
     */
    addFields(target, fields) {
        for (const field of fields) {
            if (!this.capabilityAllows(field.requiresCapability)) {
                continue;
            }
            let child = target.get(field.name);
            if (!child) {
                child = new Map();
                target.set(field.name, child);
            }
            if (field.selection?.length) {
                this.addFields(child, field.selection);
            }
        }
    }
    /**
     * Recursively print a field node tree as GraphQL syntax
     *
     * @param node - Node to print
     * @param indent - Current indentation level
     * @returns Formatted GraphQL selection string
     */
    printNode(node, indent) {
        if (!node.size) {
            return '';
        }
        const indentString = ' '.repeat(indent);
        const entries = Array.from(node.entries()).sort((left, right) => left[0].localeCompare(right[0]));
        return entries
            .map(([name, child]) => {
            if (!child.size) {
                return `${indentString}${name}`;
            }
            const body = this.printNode(child, indent + 4);
            if (!body) {
                return `${indentString}${name}`;
            }
            return `${indentString}${name} {\n${body}\n${indentString}}`;
        })
            .join('\n');
    }
}
exports.GraphQLSelectionBuilder = GraphQLSelectionBuilder;
//# sourceMappingURL=selection-builder.js.map