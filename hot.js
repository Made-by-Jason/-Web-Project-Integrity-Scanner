import mitt from "mitt";

const bus = mitt();
export const HotReloadBus = {
  get() {
    return {
      on: bus.on,
      off: bus.off,
      emit: bus.emit,
    };
  },
};

