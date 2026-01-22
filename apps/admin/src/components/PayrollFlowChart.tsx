'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from 'd3-sankey';

interface FlowNode {
    name: string;
    value?: number;
}

interface FlowLink {
    source: number;
    target: number;
    value: number;
}

interface PayrollFlowData {
    treasuryTotal: number;
    activePayruns: number;
    pendingClaims: number;
    claimedAmount: number;
    expiredAmount: number;
    byWorkerType?: {
        employees: number;
        contractors: number;
    };
}

interface PayrollFlowChartProps {
    data: PayrollFlowData;
    className?: string;
}

const formatAmount = (amount: number): string => {
    if (amount >= 1_000_000) {
        return `$${(amount / 1_000_000).toFixed(2)}M`;
    } else if (amount >= 1_000) {
        return `$${(amount / 1_000).toFixed(2)}K`;
    }
    return `$${amount.toFixed(2)}`;
};

export function PayrollFlowChart({ data, className = '' }: PayrollFlowChartProps) {
    const svgRef = useRef<SVGSVGElement>(null);

    const { nodes, links, total } = useMemo(() => {
        const total = data.treasuryTotal || 1;

        // Node indices:
        // 0: Treasury
        // 1: Active Payruns
        // 2: Employees
        // 3: Contractors
        // 4: Claimed
        // 5: Pending
        // 6: Expired

        const employeeAmount = data.byWorkerType?.employees || data.activePayruns * 0.7;
        const contractorAmount = data.byWorkerType?.contractors || data.activePayruns * 0.3;

        const nodes: FlowNode[] = [
            { name: 'Treasury', value: total },
            { name: 'Active Payruns', value: data.activePayruns },
            { name: 'Employees', value: employeeAmount },
            { name: 'Contractors', value: contractorAmount },
            { name: 'Claimed', value: data.claimedAmount },
            { name: 'Pending', value: data.pendingClaims },
            { name: 'Expired', value: data.expiredAmount },
        ];

        const links: FlowLink[] = [
            // Treasury -> Active Payruns
            { source: 0, target: 1, value: data.activePayruns || 1 },
            // Active Payruns -> Employees & Contractors
            { source: 1, target: 2, value: employeeAmount || 1 },
            { source: 1, target: 3, value: contractorAmount || 1 },
            // Employees -> Claimed/Pending
            { source: 2, target: 4, value: (data.claimedAmount * 0.7) || 1 },
            { source: 2, target: 5, value: (data.pendingClaims * 0.7) || 1 },
            // Contractors -> Claimed/Pending/Expired
            { source: 3, target: 4, value: (data.claimedAmount * 0.3) || 1 },
            { source: 3, target: 5, value: (data.pendingClaims * 0.3) || 1 },
            { source: 3, target: 6, value: data.expiredAmount || 0.1 },
        ].filter(l => l.value > 0);

        return { nodes, links, total };
    }, [data]);

    useEffect(() => {
        if (!svgRef.current) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = 800;
        const height = 400;
        const margin = { top: 20, right: 120, bottom: 20, left: 120 };

        svg.attr('viewBox', `0 0 ${width} ${height}`);

        const sankeyGenerator = sankey<FlowNode, FlowLink>()
            .nodeWidth(20)
            .nodePadding(20)
            .extent([
                [margin.left, margin.top],
                [width - margin.right, height - margin.bottom],
            ]);

        const { nodes: sankeyNodes, links: sankeyLinks } = sankeyGenerator({
            nodes: nodes.map((d) => ({ ...d })),
            links: links.map((d) => ({ ...d })),
        });

        // Gradient definitions
        const defs = svg.append('defs');

        // Green gradient for positive flows
        const greenGradient = defs
            .append('linearGradient')
            .attr('id', 'green-gradient')
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '100%')
            .attr('y2', '0%');
        greenGradient.append('stop').attr('offset', '0%').attr('stop-color', '#10b981').attr('stop-opacity', 0.8);
        greenGradient.append('stop').attr('offset', '100%').attr('stop-color', '#34d399').attr('stop-opacity', 0.8);

        // Blue gradient for pending
        const blueGradient = defs
            .append('linearGradient')
            .attr('id', 'blue-gradient')
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '100%')
            .attr('y2', '0%');
        blueGradient.append('stop').attr('offset', '0%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0.8);
        blueGradient.append('stop').attr('offset', '100%').attr('stop-color', '#60a5fa').attr('stop-opacity', 0.8);

        // Red gradient for expired
        const redGradient = defs
            .append('linearGradient')
            .attr('id', 'red-gradient')
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '100%')
            .attr('y2', '0%');
        redGradient.append('stop').attr('offset', '0%').attr('stop-color', '#ef4444').attr('stop-opacity', 0.8);
        redGradient.append('stop').attr('offset', '100%').attr('stop-color', '#f87171').attr('stop-opacity', 0.8);

        // Draw links
        svg
            .append('g')
            .attr('fill', 'none')
            .selectAll('path')
            .data(sankeyLinks)
            .join('path')
            .attr('d', sankeyLinkHorizontal())
            .attr('stroke', (d: any) => {
                const targetName = (d.target as SankeyNode<FlowNode, FlowLink>).name;
                if (targetName === 'Claimed') return 'url(#green-gradient)';
                if (targetName === 'Pending') return 'url(#blue-gradient)';
                if (targetName === 'Expired') return 'url(#red-gradient)';
                return 'url(#green-gradient)';
            })
            .attr('stroke-width', (d: any) => Math.max(2, d.width))
            .attr('opacity', 0.6)
            .on('mouseover', function () {
                d3.select(this).attr('opacity', 0.9);
            })
            .on('mouseout', function () {
                d3.select(this).attr('opacity', 0.6);
            });

        // Draw nodes
        svg
            .append('g')
            .selectAll('rect')
            .data(sankeyNodes)
            .join('rect')
            .attr('x', (d: any) => d.x0)
            .attr('y', (d: any) => d.y0)
            .attr('height', (d: any) => Math.max(1, d.y1 - d.y0))
            .attr('width', (d: any) => d.x1 - d.x0)
            .attr('fill', (d: any) => {
                if (d.name === 'Claimed') return '#10b981';
                if (d.name === 'Pending') return '#3b82f6';
                if (d.name === 'Expired') return '#ef4444';
                if (d.name === 'Treasury') return '#8b5cf6';
                if (d.name === 'Employees') return '#06b6d4';
                if (d.name === 'Contractors') return '#f59e0b';
                return '#64748b';
            })
            .attr('rx', 4)
            .attr('ry', 4);

        // Add node labels
        svg
            .append('g')
            .selectAll('text')
            .data(sankeyNodes)
            .join('text')
            .attr('x', (d: any) => (d.x0 < width / 2 ? d.x0 - 8 : d.x1 + 8))
            .attr('y', (d: any) => (d.y1 + d.y0) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', (d: any) => (d.x0 < width / 2 ? 'end' : 'start'))
            .attr('fill', '#e2e8f0')
            .attr('font-size', '12px')
            .attr('font-weight', '500')
            .text((d: any) => d.name);

        // Add value labels
        svg
            .append('g')
            .selectAll('text.value')
            .data(sankeyNodes)
            .join('text')
            .attr('class', 'value')
            .attr('x', (d: any) => (d.x0 < width / 2 ? d.x0 - 8 : d.x1 + 8))
            .attr('y', (d: any) => (d.y1 + d.y0) / 2 + 16)
            .attr('dy', '0.35em')
            .attr('text-anchor', (d: any) => (d.x0 < width / 2 ? 'end' : 'start'))
            .attr('fill', '#94a3b8')
            .attr('font-size', '10px')
            .text((d: any) => formatAmount(d.value || 0));

    }, [nodes, links]);

    return (
        <div className={`bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Payroll Flow Statement</h3>
                <div className="flex gap-2">
                    <button className="px-3 py-1 text-xs font-medium text-slate-400 hover:text-white transition-colors">
                        Monthly
                    </button>
                    <button className="px-3 py-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 rounded-lg">
                        Quarterly
                    </button>
                    <button className="px-3 py-1 text-xs font-medium text-slate-400 hover:text-white transition-colors">
                        Yearly
                    </button>
                </div>
            </div>

            <div className="flex gap-4 mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-xs text-slate-400">Claimed</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-xs text-slate-400">Pending</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-xs text-slate-400">Expired</span>
                </div>
            </div>

            <svg ref={svgRef} className="w-full" style={{ minHeight: '400px' }} />

            <div className="mt-4 grid grid-cols-4 gap-4">
                <div className="text-center">
                    <div className="text-2xl font-bold text-violet-400">{formatAmount(total)}</div>
                    <div className="text-xs text-slate-500">Total Funded</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">{formatAmount(data.claimedAmount)}</div>
                    <div className="text-xs text-slate-500">Claimed</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">{formatAmount(data.pendingClaims)}</div>
                    <div className="text-xs text-slate-500">Pending</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold text-red-400">{formatAmount(data.expiredAmount)}</div>
                    <div className="text-xs text-slate-500">Expired</div>
                </div>
            </div>
        </div>
    );
}

export default PayrollFlowChart;
