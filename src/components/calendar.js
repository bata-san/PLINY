import { store, trackChange } from '../state.js';
import { getHighestPriorityLabel } from '../utils.js';
import { pushToUndoStack } from './ui.js';
import { scheduleSave } from '../api.js';

export function initializeCalendar() {
    const calendarContainer = document.getElementById("calendar-container");
    if (!calendarContainer) return;
    if (store.calendar) store.calendar.destroy();
    // FullCalendar is a global variable from the CDN script in index.html
    store.calendar = new FullCalendar.Calendar(calendarContainer, {
        initialView: "dayGridMonth",
        locale: "ja",
        headerToolbar: {
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,listWeek",
        },
        height: "100%",
        editable: true,
        eventDrop: handleEventDrop,
        eventResize: handleEventResize,
    });
    store.calendar.render();
}

export function renderCalendar() {
    if (!store.calendar) return;
    store.calendar.getEventSources().forEach((source) => source.remove());
    const events = store.tasks
        .map((task) => {
            if (!task.startDate) return null;
            const exclusiveEndDate = new Date(task.endDate + "T00:00:00Z");
            exclusiveEndDate.setUTCDate(exclusiveEndDate.getUTCDate() + 1);
            const highestPrioLabel = getHighestPriorityLabel(task, store.labels);
            const eventColor = task.completed ? "#adb5bd" : highestPrioLabel?.color || "#007aff";
            return {
                id: task.id,
                title: task.text,
                start: task.startDate,
                end: exclusiveEndDate.toISOString().split("T")[0],
                allDay: true,
                backgroundColor: eventColor,
                borderColor: eventColor,
                extendedProps: {
                    googleEventId: task.googleEventId || null
                }
            };
        })
        .filter(Boolean);
    store.calendar.addEventSource(events);
}

async function handleEventDrop({ event }) {
    const task = store.tasks.find((t) => t.id === event.id);
    if (!task) return;
    pushToUndoStack();
    const originalDuration = new Date(task.endDate) - new Date(task.startDate);
    const newStartDate = event.start;
    const newEndDate = new Date(newStartDate.getTime() + originalDuration);
    const formatDate = (date) => date.toISOString().split("T")[0];
    task.startDate = formatDate(newStartDate);
    task.endDate = formatDate(newEndDate);
    trackChange('task', 'updated', task.id);
    scheduleSave();
}

async function handleEventResize({ event }) {
    const task = store.tasks.find((t) => t.id === event.id);
    if (!task) return;
    pushToUndoStack();
    const formatDate = (date) => date.toISOString().split("T")[0];
    const inclusiveEndDate = new Date(event.end);
    inclusiveEndDate.setDate(inclusiveEndDate.getDate() - 1);
    task.startDate = formatDate(event.start);
    task.endDate = formatDate(inclusiveEndDate);
    trackChange('task', 'updated', task.id);
    scheduleSave();
}
