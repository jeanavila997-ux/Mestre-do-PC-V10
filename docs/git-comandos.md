# Git Commands Reference Guide

Esta es una guía de referencia rápida con los comandos de Git más utilizados en el desarrollo de software, ordenados desde lo más básico hasta flujos de trabajo avanzados.

Guarda este repositorio en tus favoritos para echarle un vistazo rápido cada vez que olvides un comando.

---

## 1. Flujo de Trabajo Básico (El Día a Día)

Esta sección cubre el ciclo de vida estándar cuando trabajas en tus archivos locales y quieres subirlos al repositorio remoto.

| Comando | ¿Qué hace? |
| :--- | :--- |
| `git init` | Inicializa un nuevo repositorio Git local en la carpeta actual. |
| `git status` | Muestra el estado actual del directorio de trabajo (archivos modificados, sin rastrear o en staging). |
| `git add .` | Agrega todos los archivos modificados y nuevos al área de preparación (staging area). |
| `git add <archivo>` | Agrega únicamente un archivo específico al área de preparación. |
| `git commit -m "mensaje"` | Registra de forma permanente los cambios guardados en staging con un mensaje descriptivo. |
| `git commit --amend -m "nuevo mensaje"` | Modifica el mensaje del último commit realizado (siempre que no se haya subido al remoto). |
| `git push` | Sube los commits de tu rama local a la rama correspondiente en el repositorio remoto. |
| `git push -u origin <rama>` | Sube la rama local al remoto por primera vez y la vincula para futuros git push simples. |
| `git pull` | Descarga los últimos cambios del repositorio remoto y los fusiona directamente en tu rama actual. |
| `git fetch` | Descarga la información y el historial del remoto, pero no fusiona nada en tus archivos locales. |

---

## 2. Gestión de Ramas (Branches)

Comandos esenciales para trabajar en paralelo, crear nuevas funcionalidades y fusionar código.

| Comando | ¿Qué hace? |
| :--- | :--- |
| `git branch` | Lista todas las ramas locales de tu repositorio. Una opción común es git branch -a para ver también las remotas. |
| `git branch <nombre-rama>` | Crea una nueva rama con el nombre especificado, basándose en la rama actual. |
| `git checkout <nombre-rama>` | Cambia tu entorno de trabajo a la rama especificada. |
| `git switch <nombre-rama>` | Una alternativa moderna y más clara a checkout para cambiar de rama. |
| `git checkout -b <nombre-rama>` | Crea una nueva rama y te cambia a ella inmediatamente en un solo paso. |
| `git merge <nombre-rama>` | Fusiona la rama especificada dentro de la rama en la que te encuentras actualmente. |
| `git branch -d <nombre-rama>` | Elimina de forma segura una rama local (solo si ya fue fusionada con éxito). |
| `git branch -D <nombre-rama>` | Fuerza la eliminación de una rama local, sin importar si tiene cambios sin fusionar. |

---

## 3. Historial e Inspección (Logs & Diff)

Herramientas para auditar el código, ver quién hizo qué y entender las diferencias entre archivos.

| Comando | ¿Qué hace? |
| :--- | :--- |
| `git log` | Muestra el historial completo de commits de la rama actual en orden cronológico inverso. |
| `git log --oneline` | Muestra el historial de commits resumido en una sola línea por commit (ideal para lecturas rápidas). |
| `git log --graph --oneline --all` | Dibuja un gráfico visual en la terminal con el flujo de todas las ramas y commits. |
| `git diff` | Muestra las diferencias exactas línea por línea de los archivos modificados que aún no están en staging. |
| `git diff --staged` | Muestra los cambios realizados en los archivos que ya están en staging listos para el commit. |
| `git blame <archivo>` | Muestra línea por línea qué usuario modificó el archivo por última vez y en qué commit. |

---

## 4. Deshacer Cambios y Modificar el Historial

Comandos cruciales para cuando cometes errores, necesitas volver atrás o limpiar el progreso.

| Comando | ¿Qué hace? |
| :--- | :--- |
| `git checkout -- <archivo>` | Descarta los cambios locales en un archivo específico, devolviéndolo al estado del último commit. |
| `git restore <archivo>` | Alternativa moderna a checkout para descartar los cambios no guardados en un archivo. |
| `git reset HEAD <archivo>` | Saca un archivo del área de preparación (staging), pero mantiene sus modificaciones intactas. |
| `git reset --soft HEAD~1` | Deshace el último commit realizado, manteniendo tus archivos modificados ready en el área de staging. |
| `git reset --mixed HEAD~1` | Deshace el último commit y saca los archivos de staging, manteniendo las modificaciones locales. |
| `git reset --hard HEAD~1` | Peligro: Deshace el último commit y destruye por completo todas las modificaciones de tus archivos. |
| `git revert <hash-commit>` | Crea un nuevo commit que deshace exactamente los cambios de un commit antiguo, ideal para producción. |

---

## 5. Utilidades Avanzadas y Guardado Temporal

Comandos potentes para flujos de trabajo intermedios y avanzados en proyectos colaborativos.

| Comando | ¿Qué hace? |
| :--- | :--- |
| `git stash` | Guarda temporalmente tus cambios modificados para dejar tu espacio de trabajo vacío sin hacer commit. |
| `git stash pop` | Recupera el último bloque de cambios guardado con stash y lo aplica de nuevo a tus archivos actuales. |
| `git stash list` | Muestra la lista de todos los guardados temporales que tienes acumulados. |
| `git remote -v` | Muestra las URL de los repositorios remotos que están vinculados a tu copia local. |
| `git remote add origin <url>` | Vincula tu repositorio local con un repositorio remoto en servidores como GitHub. |
| `git cherry-pick <hash-commit>` | Copia un commit específico de cualquier otra rama y lo aplica directamente sobre tu rama actual. |

---
Consejo: Si alguna vez te pierdes con los argumentos de un comando, puedes ejecutar git <comando> --help para abrir la documentación oficial en tu navegador.
