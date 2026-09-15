import argparse
import shutil
import sys
from pathlib import Path

skills_data = [
    {
        "name": "accelerated-computing-cudf",
        "description": "NVIDIA cuDF GPU DataFrames, pandas acceleration, dask-cuDF, ETL, joins, groupby, CSV/Parquet I/O, nullable semantics, and multi-GPU DataFrame workloads.",
        "category": "Data Science & ETL",
        "content": """# Accelerated Computing cuDF Skill

## Overview
Guia oficial para aceleração de DataFrames com NVIDIA cuDF, acelerando operações do Pandas diretamente em GPU (CUDA). Suporta execução de ETL, joins massivos, groupby agregados, I/O veloz de Parquet/CSV e dask-cudf para multi-GPU.

## Quando Usar
- Acelerar pipelines Pandas sem reescrever código (`cudf.pandas`).
- Manipulação de DataFrames com milhões/bilhões de linhas.
- Operações intensivas de ETL, merge, groupby e transformações vetorizadas em GPU.

## Padrões de Código

### 1. Pandas Acceleration Mode (Drop-in Replacement)
```python
%load_ext cudf.pandas
import pandas as pd  # Agora roda automaticamente na GPU com fallback transparente para CPU
```

### 2. cuDF Nativo e I/O de Alta Performance
```python
import cudf

# Leitura ultrarrápida de Parquet/CSV na memória da GPU
df = cudf.read_parquet("dados_grandes.parquet")
agrupado = df.groupby(["categoria", "regiao"]).agg({
    "valor": ["sum", "mean"],
    "quantidade": "count"
})
agrupado.to_parquet("resultado_gpu.parquet")
```
"""
    },
    {
        "name": "cuopt-install",
        "description": "Install cuOpt for Python, C, or server via pip, conda, or Docker; verify the install.",
        "category": "Optimization",
        "content": """# cuOpt Install & Verification Skill

## Overview
Instalação e verificação do NVIDIA cuOpt para otimização combinatória, roteamento de frotas e problemas matemáticos lineares/quadráticos em GPU.

## Métodos de Instalação

### Conda (Recomendado)
```bash
conda create -n cuopt-env -c nvidia -c conda-forge cuopt python=3.10
conda activate cuopt-env
```

### Pip
```bash
pip install --extra-index-url https://pypi.nvidia.com cuopt-cu12
```

### Verificação da Instalação
```python
import cuopt
print(f"cuOpt Version: {cuopt.__version__}")
```
"""
    },
    {
        "name": "cudaq-guide",
        "description": "CUDA-Q onboarding guide for installation, test programs, GPU simulation, QPU hardware, and quantum applications.",
        "category": "Quantum Computing",
        "content": """# CUDA-Q Guide Skill

## Overview
Guia para desenvolvimento quântico híbrido com NVIDIA CUDA-Q, conectando processadores quânticos (QPUs) e simuladores GPU com aceleração quântica clássica.

## Padrão de Código CUDA-Q (Python)
```python
import cudaq

@cudaq.kernel
def bell_pair():
    q = cudaq.qvector(2)
    h(q[0])
    cx(q[0], q[1])
    mz(q)

counts = cudaq.sample(bell_pair)
print(counts)
```
"""
    },
    {
        "name": "cuopt-routing-api-python",
        "description": "Vehicle routing (VRP, TSP, PDP) with cuOpt — Python API only.",
        "category": "Optimization & Logistics",
        "content": """# cuOpt Routing API Python Skill

## Overview
Resolução de problemas de roteamento de frotas (VRP, TSP, Pickup and Delivery) em tempo real utilizando a API Python acelerada por GPU do NVIDIA cuOpt.

## Padrão de Modelagem VRP
```python
import cuopt
import cudf

routing_data = cuopt.RoutingDataModel(n_locations=100, n_fleet=10)
# Configura matriz de distâncias/tempos e janelas de atendimento
# Resolve com GPU solver
solver = cuopt.RoutingSolver(routing_data)
solution = solver.solve()
```
"""
    },
    {
        "name": "cuopt-server-api-python",
        "description": "cuOpt REST server — start server, endpoints, Python/curl client examples.",
        "category": "Optimization & Infrastructure",
        "content": """# cuOpt Server REST API Skill

## Overview
Implantação e consumo do microserviço REST do NVIDIA cuOpt para otimização remota em escala de produção.

## Endpoints Principais
- `POST /cuopt/routes`: Submissão de problema de roteamento com JSON.
- `GET /cuopt/health`: Verificação de prontidão do servidor e GPU.
"""
    },
    {
        "name": "cuopt-numerical-optimization-formulation",
        "description": "LP, MILP, QP — concepts, problem-text parsing, and formulation patterns (parameters, constraints, decisions, objective).",
        "category": "Optimization & Math",
        "content": """# cuOpt Numerical Optimization Formulation Skill

## Overview
Modelagem matemática conceitual e formulação de Programação Linear (LP), Programação Inteira Mista (MILP) e Programação Quadrática (QP) para resolução acelerada em GPU.
"""
    },
    {
        "name": "cupynumeric-install",
        "description": "Install and verify cuPyNumeric for Python — requirements, commands, verification.",
        "category": "Accelerated Math",
        "content": """# cuPyNumeric Install Skill

## Overview
Instalação do cuPyNumeric (NVIDIA Legate) para execução distribuída e transparente de código NumPy em clusters de GPUs.

## Instalação Conda
```bash
conda install -c nvidia -c conda-forge cupynumeric
```
"""
    },
    {
        "name": "cupynumeric-migration-readiness",
        "description": "Pre-migration readiness assessor for porting NumPy to cuPyNumeric.",
        "category": "Accelerated Math & Migration",
        "content": """# cuPyNumeric Migration Readiness Skill

## Overview
Avaliação prévia e mapeamento de código NumPy legado para transição suave rumo ao cuPyNumeric distribuído sem gargalos de comunicação PCIe.
"""
    },
    {
        "name": "cupynumeric-parallel-data-load",
        "description": "Load a sharded, on-disk dataset into a distributed cuPyNumeric ndarray.",
        "category": "Accelerated Math & I/O",
        "content": """# cuPyNumeric Parallel Data Load Skill

## Overview
Carregamento particionado de grandes volumes de dados (.npy, Parquet, binários brutos) em arrays distribuídos de GPU sem sobrecarregar a memória do host.
"""
    },
    {
        "name": "cupynumeric-hdf5",
        "description": "Read and write large cuPyNumeric arrays to HDF5 with Legate parallel I/O.",
        "category": "Accelerated Math & Storage",
        "content": """# cuPyNumeric HDF5 Skill

## Overview
Leitura e escrita de datasets HDF5 de alta escala diretamente para arrays cuPyNumeric em GPU utilizando I/O paralelo.
"""
    },
    {
        "name": "tilegym-adding-cutile-kernel",
        "description": "Add a new cuTile GPU kernel operator to TileGym. Covers dispatch registration in ops.py, backend implementation, and benchmarks.",
        "category": "GPU Kernel Engineering",
        "content": """# TileGym Adding cuTile Kernel Skill

## Overview
Desenvolvimento e registro de novos operadores de kernel de GPU baseados em tiles no framework TileGym.
"""
    },
    {
        "name": "tilegym-cutile-python",
        "description": "Expert cuTile programming assistant. Write high-performance GPU kernels using cuTile tile-based programming model.",
        "category": "GPU Kernel Engineering",
        "content": """# TileGym cuTile Python Skill

## Overview
Programação especializada de kernels de GPU de alto desempenho utilizando a abstração de tiles do cuTile.
"""
    },
    {
        "name": "tilegym-monkey-patch-kernels-to-transformers",
        "description": "Integrate TileGym kernels into Hugging Face transformers models by replacing submodules and forward passes.",
        "category": "LLM & Transformers Optimization",
        "content": """# TileGym Monkey Patch Transformers Skill

## Overview
Substituição em runtime de camadas de atenção e projeções de modelos Hugging Face Transformers por kernels otimizados do TileGym.
"""
    },
    {
        "name": "tilegym-improve-cutile-kernel-perf",
        "description": "Iteratively optimize cuTile kernel performance through systematic profiling, bottleneck analysis, and tuning.",
        "category": "GPU Kernel Performance",
        "content": """# TileGym Improve cuTile Kernel Performance Skill

## Overview
Tuning e profiling sistemático de kernels cuTile: ajuste de tile sizes, ocupação de SM, TMA (Tensor Memory Accelerator) e redução de latência de memória compartilhada.
"""
    },
    {
        "name": "tilegym-cutile-autotuning",
        "description": "Use when adding, modifying, optimizing, or debugging CuTile autotuning code.",
        "category": "GPU Autotuning",
        "content": """# TileGym cuTile Autotuning Skill

## Overview
Autotuning exaustivo e heurístico de configurações de lançamento de kernels cuTile para extrair o máximo de FLOPS do hardware.
"""
    },
    {
        "name": "tilegym-converting-cutile-to-triton",
        "description": "Converts cuTile GPU kernels (@ct.kernel) to Triton (@triton.jit).",
        "category": "Kernel Translation",
        "content": """# TileGym Converting cuTile to Triton Skill

## Overview
Mapeamento e conversão de kernels desenvolvidos em cuTile para kernels equivalentes em OpenAI Triton JIT.
"""
    },
    {
        "name": "tilegym-converting-cutile-to-julia",
        "description": "Converts cuTile Python GPU kernels to cuTile.jl Julia equivalents.",
        "category": "Kernel Translation",
        "content": """# TileGym Converting cuTile to Julia Skill

## Overview
Tradução de sintaxe, alinhamento de memória (Row-Major vs Col-Major) e indexação 0-based vs 1-based de Python para Julia.
"""
    },
    {
        "name": "cuopt-multi-objective-exploration",
        "description": "Trace and interpret the Pareto frontier across competing objectives using repeated cuOpt solves.",
        "category": "Optimization",
        "content": """# cuOpt Multi-Objective Exploration Skill

## Overview
Exploração de fronteiras de Pareto em problemas de otimização com múltiplos objetivos concorrentes via NVIDIA cuOpt.
"""
    },
    {
        "name": "doca-aes-gcm",
        "description": "Hands-on DOCA AES-GCM encryption/decryption acceleration on BlueField DPU and ConnectX NICs.",
        "category": "NVIDIA DOCA & DPU",
        "content": """# DOCA AES-GCM Skill

## Overview
Aceleração em hardware de criptografia e decriptografia AES-GCM em placas DPU BlueField e NICs ConnectX via NVIDIA DOCA.
"""
    },
    {
        "name": "doca-dma",
        "description": "DOCA DMA programming for high-speed memory copying on BlueField DPUs.",
        "category": "NVIDIA DOCA & DPU",
        "content": """# DOCA DMA Skill

## Overview
Configuração de contextos DMA e buffers de memória para transferência de dados de ultra-baixa latência offloaded no hardware DPU.
"""
    },
    {
        "name": "doca-gpi",
        "description": "DOCA GPU-Packet-Initiator programming to drive RDMA queues directly from GPU memory.",
        "category": "NVIDIA DOCA & GPUDirect",
        "content": """# DOCA GPI Skill

## Overview
Acoplamento de GPU-Packet-Initiator para que kernels CUDA enviem e recebam pacotes RDMA diretamente da memória de vídeo sem passar pela CPU do host.
"""
    },
    {
        "name": "doca-compress",
        "description": "Hardware compression (Deflate, LZ4) programming on BlueField DPU with DOCA.",
        "category": "NVIDIA DOCA & DPU",
        "content": """# DOCA Compress Skill

## Overview
Compressão e descompressão Deflate e LZ4 em tempo de linha executadas diretamente pelo hardware da DPU.
"""
    },
    {
        "name": "doca-dpa",
        "description": "DOCA DPA host-side programming, creating DPA threads and launching DPA app kernels.",
        "category": "NVIDIA DOCA & DPU",
        "content": """# DOCA DPA Skill

## Overview
Programação do Data Path Accelerator (DPA) em BlueField para processamento de pacotes diretamente no caminho de dados da rede.
"""
    },
    {
        "name": "doca-dpdk-bridge",
        "description": "Bridge existing DPDK applications with DOCA Flow hardware steering.",
        "category": "NVIDIA DOCA & Networking",
        "content": """# DOCA DPDK Bridge Skill

## Overview
Integração de aplicações legadas DPDK com aceleração e roteamento por hardware via DOCA Flow.
"""
    },
    {
        "name": "doca-erasure-coding",
        "description": "DOCA Erasure Coding offloading on BlueField DPU for resilient storage.",
        "category": "NVIDIA DOCA & Storage",
        "content": """# DOCA Erasure Coding Skill

## Overview
Aceleração em hardware de cálculos de paridade e reconstrução de blocos com Erasure Coding para storage distribuído.
"""
    },
    {
        "name": "doca-sha-offload-engine",
        "description": "Wire DOCA SHA OpenSSL ENGINE to offload SHA-1, SHA-256, SHA-512 into hardware.",
        "category": "NVIDIA DOCA & Security",
        "content": """# DOCA SHA Offload Engine Skill

## Overview
Integração de OpenSSL com a aceleração de hash SHA em hardware das placas BlueField.
"""
    },
    {
        "name": "doca-gpunetio",
        "description": "DOCA GPUNetIO programming for direct CUDA kernel to Ethernet queue communication.",
        "category": "NVIDIA DOCA & GPUDirect",
        "content": """# DOCA GPUNetIO Skill

## Overview
Comunicação de taxa de linha entre kernels CUDA e filas Ethernet sem intervenção do host, reduzindo o jitter para aplicações de tempo real.
"""
    },
    {
        "name": "doca-rdmi",
        "description": "DOCA RDMA Initiator programming for one-sided RDMA flows.",
        "category": "NVIDIA DOCA & RDMA",
        "content": """# DOCA RDMI Skill

## Overview
Configuração de fluxos RDMA unilaterais iniciados por aceleradores para clusters de alta performance.
"""
    },
    {
        "name": "doca-sha",
        "description": "DOCA SHA programming for one-shot and incremental hashing on DPU accelerators.",
        "category": "NVIDIA DOCA & Security",
        "content": """# DOCA SHA Skill

## Overview
Geração de hashes SHA-1, SHA-256 e SHA-512 em lote e por streaming diretamente no acelerador.
"""
    },
    {
        "name": "portfolio-optimization",
        "description": "Build, optimize, backtest, and analyze stock portfolios with Mean-CVaR, Mean-Variance/SOCP and NVIDIA cuOpt.",
        "category": "FinTech & Optimization",
        "content": """# Portfolio Optimization with cuOpt Skill

## Overview
Otimização quantitativa de portfólios de investimentos, fronteiras eficientes de Markowitz, restrições CVaR e simulações Monte Carlo com aceleração GPU do cuOpt.
"""
    },
    {
        "name": "warp-eval",
        "description": "Evaluate code for NVIDIA Warp candidate suitability in spatial computing, physics simulations, and geometry.",
        "category": "Spatial & Physics Simulation",
        "content": """# NVIDIA Warp Evaluation Skill

## Overview
Avaliação de código e algoritmos espaciais, simulação de partículas e geometria 3D para aceleração nativa com NVIDIA Warp.
"""
    }
]

def next_backup_path(skill_file: Path) -> Path:
    candidate = skill_file.with_name(f"{skill_file.name}.bak")
    suffix = 1
    while candidate.exists():
        candidate = skill_file.with_name(f"{skill_file.name}.bak.{suffix}")
        suffix += 1
    return candidate


def install_skills(skills_root: Path, assume_yes: bool = False) -> int:
    existing = [
        skills_root / item["name"] / "SKILL.md"
        for item in skills_data
        if (skills_root / item["name"] / "SKILL.md").exists()
    ]
    if existing and not assume_yes:
        if not sys.stdin.isatty():
            raise RuntimeError(
                "Skills existentes seriam sobrescritas. Execute novamente com --yes "
                "para confirmar; backups serao criados."
            )
        try:
            answer = input(
                f"{len(existing)} SKILL.md existente(s) serao salvos em backup e sobrescritos. Continuar? [y/N] "
            )
        except EOFError as error:
            raise RuntimeError(
                "Confirmacao indisponivel. Execute novamente com --yes para confirmar; "
                "backups serao criados."
            ) from error
        if answer.strip().lower() not in {"y", "yes", "s", "sim"}:
            print("Instalacao cancelada; nenhum arquivo foi alterado.")
            return 0

    skills_root.mkdir(parents=True, exist_ok=True)
    count = 0
    for item in skills_data:
        folder = skills_root / item["name"]
        folder.mkdir(parents=True, exist_ok=True)

        skill_file = folder / "SKILL.md"
        if skill_file.exists():
            shutil.copy2(skill_file, next_backup_path(skill_file))

        frontmatter = f"""---
name: {item["name"]}
description: "{item["description"]}"
category: "{item["category"]}"
domain: accelerated_computing
tags: [nvidia, gpu, cuda, accelerated-computing, performance]
version: 1.0.0
---

"""
        full_content = frontmatter + item["content"].strip() + "\n"
        skill_file.write_text(full_content, encoding="utf-8")
        count += 1

    print(f"Sucesso: {count} skills da NVIDIA instaladas em {skills_root}")
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Instala skills NVIDIA sem sobrescrever arquivos silenciosamente.")
    parser.add_argument(
        "--skills-root",
        type=Path,
        default=Path.home() / ".claude" / "skills",
        help="Diretorio de destino (padrao: ~/.claude/skills).",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirma sobrescritas sem prompt; cada SKILL.md existente recebe backup.",
    )
    args = parser.parse_args()
    install_skills(args.skills_root.expanduser().resolve(), args.yes)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        raise SystemExit(1) from error
