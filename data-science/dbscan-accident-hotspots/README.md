# DBSCAN Accident Hotspots

Jupyter notebook for my DBSCAN group report in Introduction to Data Science (COMP 034). It follows the report slide by slide and uses the same story: finding road-accident hotspots on a map.

## What's in the notebook

| Part | Topic | Slides |
| --- | --- | --- |
| 1 | The problem: a map full of accident dots | 3 |
| 2 | DBSCAN vs. K-Means on curved data | 5 |
| 3 | The two settings, ε and MinPts, and straight-line distance | 6–7 |
| 4 | Worked example: counting neighbors to find the core points of A to N | 8, 10 |
| 5 | DBSCAN written from scratch in 4 steps | 9 |
| 6 | The same result with scikit-learn's `DBSCAN` | 11 |
| 7 | Turning the clusters into a hotspot report | 12 |
| 8 | What happens when ε and MinPts change | 13 |
| 9 | Picking ε with a k-distance graph on a bigger map | 13 |
| 10 | Knowledge check: core, border, or noise | 16 |
| 11 | A limitation: hotspots with different densities | 15 |
| 12 | Try it yourself: change the settings and re-run | – |

## Run it in VS Code

1. Install the **Python** and **Jupyter** extensions in VS Code.
2. Open this folder in VS Code (**File → Open Folder → dbscan-accident-hotspots**).
3. Open the terminal (**Terminal → New Terminal**) and set up the environment:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

4. Open `dbscan.ipynb`.
5. Click **Select Kernel** (top right) → **Python Environments** → `.venv`.
6. Click **Run All**.

Works on Python 3.12, with both the oldest and the newest package versions that `requirements.txt` allows.

## Data

Every map point is made up for practice. The EDSA and Commonwealth Avenue numbers in Part 1 come from MMDA data reported by GMA News (June 26, 2025).

## References

- Ester, M., Kriegel, H.-P., Sander, J., & Xu, X. (1996). A density-based algorithm for discovering clusters in large spatial databases with noise. *Proceedings of KDD-96*, 226–231.
- Schubert, E., Sander, J., Ester, M., Kriegel, H.-P., & Xu, X. (2017). DBSCAN revisited, revisited. *ACM Transactions on Database Systems, 42*(3), Article 19.
- [scikit-learn `DBSCAN` documentation](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.DBSCAN.html)
