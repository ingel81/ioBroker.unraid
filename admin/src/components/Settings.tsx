import React from 'react';
import { styled } from '@mui/material/styles';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { I18n } from '@iobroker/adapter-react-v5';

import {
    domainTree,
    collectNodeIds,
    defaultEnabledDomains,
    type DomainNode,
    type DomainId,
    allDomainIds,
    getDomainAncestors,
    domainNodeById,
} from '../../../src/shared/unraid-domains';
import type enTranslations from '../i18n/en.json';

// Local type for admin words
type AdminWord = keyof typeof enTranslations;

// Styled components
const StyledTab = styled('form')(({ theme }) => ({
    maxWidth: 800,
    padding: theme.spacing(2),
    color: theme.palette.text.primary,
}));

const Section = styled('div')({
    marginBottom: 24,
});

const SectionHeader = styled(Typography)(({ theme }) => ({
    marginBottom: 8,
    color: theme.palette.text.primary,
}));

const StyledInput = styled(TextField)({
    marginTop: 0,
    width: '100%',
    maxWidth: 600,
    marginBottom: 16,
});

const ControlElement = styled('div')({
    marginBottom: 16,
});

const TreeContainer = styled('div')(({ theme }) => ({
    border: `1px solid ${theme.palette.mode === 'dark' ? '#555' : '#cccccc'}`,
    borderRadius: 4,
    padding: '12px 16px',
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
}));

const TreeRow = styled('div')({
    display: 'flex',
    alignItems: 'center',
    marginBottom: 4,
});

const TreeToggle = styled('button')(({ theme }) => ({
    width: 28,
    height: 28,
    marginRight: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${theme.palette.mode === 'dark' ? '#666' : '#cccccc'}`,
    borderRadius: 4,
    padding: 0,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: theme.palette.text.primary,
    '&:hover': {
        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)',
    },
}));

const TreeTogglePlaceholder = styled('span')({
    width: 28,
    height: 28,
    marginRight: 8,
});

const TreeLabel = styled(FormControlLabel)(({ theme }) => ({
    flexGrow: 1,
    color: theme.palette.text.primary,
}));

const TreeChildren = styled('div')({
    marginLeft: 28,
});

const TreeDescription = styled(Typography)(({ theme }) => ({
    marginLeft: 36,
    marginBottom: 8,
    color: theme.palette.text.secondary,
}));

/**
 * Props for the Settings component
 */
interface SettingsProps {
    /** Current native configuration from ioBroker */
    native: ioBroker.AdapterConfig;
    /** Callback to update configuration values */
    onChange: <K extends keyof ioBroker.AdapterConfig>(attr: K, value: ioBroker.AdapterConfig[K]) => void;
    /** Current theme type (light/dark) */
    themeType?: string;
}

/**
 * State for the Settings component
 */
interface SettingsState {
    /** Set of expanded domain IDs in the tree view */
    expandedDomainIds: Set<string>;
}

const treeOrder = new Map<string, number>();
allDomainIds.forEach((id, index) => treeOrder.set(id, index));

/**
 * Sort domain IDs according to their position in the tree.
 *
 * @param ids - Domain IDs to sort
 * @returns Sorted array of domain IDs
 */
const sortByTreeOrder = (ids: Iterable<DomainId>): DomainId[] => {
    const uniqueIds = Array.from(new Set(ids));
    return uniqueIds.sort((left, right) => {
        const leftIndex = treeOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = treeOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
    });
};

/**
 * Check if a node and all its children are selected.
 *
 * @param node - Domain node to check
 * @param selection - Current selection set
 * @returns True if node and all children are selected
 */
const isNodeFullySelected = (node: DomainNode, selection: Set<DomainId>): boolean => {
    if (!selection.has(node.id)) {
        return false;
    }

    if (!node.children?.length) {
        return true;
    }

    return node.children.every(child => isNodeFullySelected(child, selection));
};

/**
 * Check if a node or any of its descendants are selected.
 *
 * @param node - Domain node to check
 * @param selection - Current selection set
 * @returns True if node or any descendant is selected
 */
const nodeHasSelectedDescendant = (node: DomainNode, selection: Set<DomainId>): boolean => {
    if (selection.has(node.id)) {
        return true;
    }

    if (!node.children?.length) {
        return false;
    }

    return node.children.some(child => nodeHasSelectedDescendant(child, selection));
};

/**
 * Check if a node is partially selected (some but not all children).
 *
 * @param node - Domain node to check
 * @param selection - Current selection set
 * @returns True if node has mixed selection state
 */
const isNodePartiallySelected = (node: DomainNode, selection: Set<DomainId>): boolean => {
    if (!node.children?.length) {
        return false;
    }

    const descendantSelected = node.children.some(child => nodeHasSelectedDescendant(child, selection));
    if (!descendantSelected) {
        return false;
    }

    return !isNodeFullySelected(node, selection);
};

/**
 * Settings component for configuring the Unraid adapter.
 * Provides UI for connection settings and domain selection.
 */
class Settings extends React.Component<SettingsProps, SettingsState> {
    /**
     * Initialize the settings component with expanded tree state.
     *
     * @param props - Component properties
     */
    constructor(props: SettingsProps) {
        super(props);

        const expandable = new Set<string>();
        for (const node of domainTree) {
            if (node.children?.length) {
                expandable.add(node.id);
            }
        }

        this.state = {
            expandedDomainIds: expandable,
        };
    }

    /**
     * Render a text input field for adapter configuration.
     *
     * @param title - Translation key for the label
     * @param attr - Configuration attribute name
     * @param type - Input field type
     * @param additionalProps - Additional props for TextField
     * @returns TextField component
     */
    private renderInput<K extends keyof ioBroker.AdapterConfig>(
        title: AdminWord,
        attr: K,
        type: TextFieldProps['type'],
        additionalProps: Partial<TextFieldProps> = {},
    ): React.ReactNode {
        const { native } = this.props;
        const currentValue = native[attr];
        const value = typeof currentValue === 'string' ? currentValue : '';

        return (
            <StyledInput
                variant="standard"
                label={I18n.t(title)}
                value={value}
                type={type ?? 'text'}
                onChange={event => {
                    const nextValue = event.target.value;
                    this.props.onChange(attr, nextValue as ioBroker.AdapterConfig[K]);
                }}
                margin="normal"
                fullWidth
                {...additionalProps}
            />
        );
    }

    /**
     * Render the polling interval input field with validation.
     *
     * @returns TextField component for poll interval
     */
    private renderPollInterval(): React.ReactNode {
        const { native } = this.props;
        const value = typeof native.pollIntervalSeconds === 'number' ? native.pollIntervalSeconds : 60;

        return (
            <StyledInput
                variant="standard"
                label={I18n.t('pollIntervalSeconds')}
                value={value}
                type="number"
                slotProps={{ htmlInput: { min: 10, step: 5 } }}
                onChange={event => {
                    const inputValue = event.target.value;
                    // Allow empty string for editing
                    if (inputValue === '') {
                        this.props.onChange('pollIntervalSeconds', 0);
                        return;
                    }
                    const parsed = Number(inputValue);
                    if (Number.isFinite(parsed) && parsed >= 0) {
                        this.props.onChange('pollIntervalSeconds', parsed);
                    }
                }}
                onBlur={() => {
                    // Validate and sanitize on blur
                    const currentValue = native.pollIntervalSeconds;
                    const numValue = typeof currentValue === 'number' ? currentValue : Number(currentValue);
                    const sanitized = Number.isFinite(numValue) ? Math.max(10, Math.floor(numValue)) : 60;
                    if (sanitized !== currentValue) {
                        this.props.onChange('pollIntervalSeconds', sanitized);
                    }
                }}
                helperText={I18n.t('pollIntervalSeconds_help')}
                margin="normal"
                fullWidth
            />
        );
    }

    private toggleDomainExpansion = (id: string): void => {
        this.setState(prev => {
            const next = new Set(prev.expandedDomainIds);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return { expandedDomainIds: next };
        });
    };

    private handleDomainToggle = (node: DomainNode, shouldSelect: boolean): void => {
        const currentRaw = Array.isArray(this.props.native.enabledDomains)
            ? this.props.native.enabledDomains
            : [...defaultEnabledDomains];
        const current: DomainId[] = currentRaw.filter((id): id is DomainId => domainNodeById.has(id as DomainId));
        const next = new Set<DomainId>(current);
        const affectedIds = collectNodeIds(node);

        if (shouldSelect) {
            affectedIds.forEach(id => next.add(id));
            getDomainAncestors(node.id).forEach(ancestorId => next.add(ancestorId));
        } else {
            affectedIds.forEach(id => next.delete(id));
            this.pruneAncestors(node.id, next);
        }

        this.props.onChange('enabledDomains', sortByTreeOrder(next));
    };

    private pruneAncestors(domainId: DomainId, selection: Set<DomainId>): void {
        const ancestors = getDomainAncestors(domainId);

        for (const ancestorId of ancestors) {
            if (selection.has(ancestorId)) {
                const ancestorNode = domainNodeById.get(ancestorId);
                if (!ancestorNode) {
                    continue;
                }

                const descendantIds = collectNodeIds(ancestorNode).filter(id => id !== ancestorId);
                const hasSelectedDescendant = descendantIds.some(id => selection.has(id));
                if (!hasSelectedDescendant) {
                    selection.delete(ancestorId);
                }
            }
        }
    }

    /**
     * Render a domain node in the selection tree.
     *
     * @param node - Domain node to render
     * @param depth - Current depth in the tree
     * @param selection - Current selection set
     * @returns React node for the domain
     */
    private renderDomainNode(node: DomainNode, depth: number, selection: Set<DomainId>): React.ReactNode {
        const hasChildren = !!node.children?.length;
        const isExpanded = this.state.expandedDomainIds.has(node.id);
        const isChecked = isNodeFullySelected(node, selection);
        const isIndeterminate = isNodePartiallySelected(node, selection);

        return (
            <React.Fragment key={node.id}>
                <TreeRow style={{ paddingLeft: depth * 20 }}>
                    {hasChildren ? (
                        <TreeToggle
                            type="button"
                            onClick={() => this.toggleDomainExpansion(node.id)}
                            aria-label={isExpanded ? I18n.t('collapseNode') : I18n.t('expandNode')}
                        >
                            {isExpanded ? '-' : '+'}
                        </TreeToggle>
                    ) : (
                        <TreeTogglePlaceholder />
                    )}
                    <TreeLabel
                        control={
                            <Checkbox
                                color="primary"
                                checked={isChecked}
                                indeterminate={isIndeterminate}
                                onChange={(_event, checked) => this.handleDomainToggle(node, checked)}
                            />
                        }
                        label={I18n.t(node.label as AdminWord)}
                    />
                </TreeRow>
                {node.description ? (
                    <TreeDescription variant="caption">{I18n.t(node.description as AdminWord)}</TreeDescription>
                ) : null}
                {hasChildren && isExpanded ? (
                    <TreeChildren>
                        {node.children!.map(child => this.renderDomainNode(child, depth + 1, selection))}
                    </TreeChildren>
                ) : null}
            </React.Fragment>
        );
    }

    /**
     * Render the complete settings UI.
     *
     * @returns React component tree for settings
     */
    render(): React.ReactNode {
        const { native } = this.props;
        const enabledDomainsArrayRaw = Array.isArray(native.enabledDomains)
            ? native.enabledDomains
            : [...defaultEnabledDomains];
        const enabledDomainsArray: DomainId[] = enabledDomainsArrayRaw.filter((id): id is DomainId =>
            domainNodeById.has(id as DomainId),
        );
        const selection = new Set<DomainId>(enabledDomainsArray);

        return (
            <StyledTab>
                <Section>
                    <SectionHeader variant="h6">{I18n.t('section.connection')}</SectionHeader>
                    {this.renderInput('baseUrl', 'baseUrl', 'text', {
                        required: true,
                        helperText: I18n.t('baseUrl_help'),
                    })}
                    {this.renderInput('apiToken', 'apiToken', 'password', {
                        required: true,
                        helperText: I18n.t('apiToken_help'),
                        autoComplete: 'off',
                    })}
                    <ControlElement>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    color="primary"
                                    checked={!!native.allowSelfSigned}
                                    onChange={(_event, checked) => this.props.onChange('allowSelfSigned', checked)}
                                />
                            }
                            label={I18n.t('allowSelfSigned')}
                        />
                        <Typography
                            variant="caption"
                            color="textSecondary"
                            sx={{ display: 'block', marginLeft: 4 }}
                        >
                            {I18n.t('allowSelfSigned_help')}
                        </Typography>
                    </ControlElement>
                </Section>

                <Divider />

                <Section>
                    <SectionHeader variant="h6">{I18n.t('section.polling')}</SectionHeader>
                    {this.renderPollInterval()}
                    {/* Subscription support temporarily disabled due to Unraid API issues
                    <ControlElement>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    color="primary"
                                    checked={!!native.useSubscriptions}
                                    onChange={(event, checked) => this.props.onChange('useSubscriptions', checked)}
                                />
                            }
                            label={I18n.t('useSubscriptions')}
                        />
                        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', marginLeft: 4 }}>
                            {I18n.t('useSubscriptions_help')}
                        </Typography>
                    </ControlElement>
                    */}
                </Section>

                <Divider />

                <Section>
                    <SectionHeader variant="h6">{I18n.t('section.domains')}</SectionHeader>
                    <Typography
                        variant="body2"
                        color="textSecondary"
                        sx={{ marginBottom: 2 }}
                    >
                        {I18n.t('enabledDomains_help')}
                    </Typography>
                    <TreeContainer>{domainTree.map(node => this.renderDomainNode(node, 0, selection))}</TreeContainer>
                </Section>
            </StyledTab>
        );
    }
}

export default Settings;
