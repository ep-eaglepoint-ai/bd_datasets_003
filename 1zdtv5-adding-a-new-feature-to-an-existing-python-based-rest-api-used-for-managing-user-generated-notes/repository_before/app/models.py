from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    token = Column(String, unique=True, nullable=False)

    notes = relationship("Note", back_populates="owner")


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, nullable=False)
    content = Column(String, nullable=False)

    owner = relationship("User", back_populates="notes")
