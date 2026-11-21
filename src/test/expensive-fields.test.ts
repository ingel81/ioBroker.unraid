import { expect } from 'chai';

import { GraphQLSelectionBuilder } from '../graphql/selection-builder';
import { domainDefinitions } from '../shared/unraid-domains';

const containers = domainDefinitions.find(d => d.id === 'docker.containers');

describe('expensive fields', () => {
    it('includes sizeRootFs by default', () => {
        const builder = new GraphQLSelectionBuilder();
        builder.addSelections(containers!.selection);
        expect(builder.build()).to.contain('sizeRootFs');
    });

    it('leaves sizeRootFs out when expensive fields are skipped', () => {
        const builder = new GraphQLSelectionBuilder(undefined, false);
        builder.addSelections(containers!.selection);
        const query = builder.build() ?? '';
        expect(query).to.not.contain('sizeRootFs');
        expect(query).to.contain('state');
    });
});
