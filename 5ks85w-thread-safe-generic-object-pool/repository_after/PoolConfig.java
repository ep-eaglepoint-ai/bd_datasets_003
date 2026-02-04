

import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.function.Supplier;

public class PoolConfig<T> {
    private final int maxSize;
    private final Supplier<T> factory;
    private final Predicate<T> validator;
    private final Consumer<T> destroyer;
    private final long idleTimeoutMillis;

    private PoolConfig(Builder<T> builder) {
        this.maxSize = builder.maxSize;
        this.factory = builder.factory;
        this.validator = builder.validator;
        this.destroyer = builder.destroyer;
        this.idleTimeoutMillis = builder.idleTimeoutMillis;
    }

    public int getMaxSize() {
        return maxSize;
    }

    public Supplier<T> getFactory() {
        return factory;
    }

    public Predicate<T> getValidator() {
        return validator;
    }

    public Consumer<T> getDestroyer() {
        return destroyer;
    }

    public long getIdleTimeoutMillis() {
        return idleTimeoutMillis;
    }

    public static <T> Builder<T> builder(Supplier<T> factory, int maxSize) {
        return new Builder<>(factory, maxSize);
    }

    public static class Builder<T> {
        private final Supplier<T> factory;
        private final int maxSize;
        private Predicate<T> validator = t -> true;
        private Consumer<T> destroyer = t -> {};
        private long idleTimeoutMillis = Long.MAX_VALUE;

        private Builder(Supplier<T> factory, int maxSize) {
            this.factory = factory;
            this.maxSize = maxSize;
        }

        public Builder<T> validator(Predicate<T> validator) {
            this.validator = validator;
            return this;
        }

        public Builder<T> destroyer(Consumer<T> destroyer) {
            this.destroyer = destroyer;
            return this;
        }

        public Builder<T> idleTimeoutMillis(long idleTimeoutMillis) {
            this.idleTimeoutMillis = idleTimeoutMillis;
            return this;
        }

        public PoolConfig<T> build() {
            return new PoolConfig<>(this);
        }
    }
}
