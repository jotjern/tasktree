# TaskDAG - Task Directed Acyclic Graph

This project is an advanced todo list representing a users tasks as a graph to more easily allow user to track their tasks
The main focus is to be extremely ergonomic, allowing the user to use minimal effort to create, update and remove tasks as well as give an easy overview
The project is created with vite+typescript
From left there is low level tasks, tasks which can be completed right now, which point to the right at bigger and bigger tasks until root tasks on the very right

## Keyboard shortcuts:
* left up down right - navigate tasks
* space - mark as completed/uncompleted
* backspace - delete task (soft delete, gray out, if backspace again hard delete)
* enter - rename
* shift + enter - create new subtask
* cmd + shift + enter - create new root task

## Visuals
All root tasks should have a visually distinct color
On the left all leaf tasks should be aligned
On the right all root tasks should be visible despite being off screen

All data should be saved in localstorage
