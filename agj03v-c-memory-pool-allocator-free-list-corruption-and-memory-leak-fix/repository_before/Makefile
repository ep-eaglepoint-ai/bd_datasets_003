CC = gcc
CFLAGS = -Wall -Wextra -g -pthread -std=c11

SRCS = pool.c freelist.c
OBJS = $(SRCS:.c=.o)
LIB = libpool.a

all: $(LIB)

$(LIB): $(OBJS)
	ar rcs $@ $^

%.o: %.c pool.h
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(LIB)

.PHONY: all clean
