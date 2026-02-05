class Department < ApplicationRecord
  belongs_to :organization
  belongs_to :parent, class_name: 'Department', optional: true
  has_many :children, class_name: 'Department', foreign_key: :parent_id
  has_many :users

  validates :name, presence: true

  def head
    users.find_by(role: 'department_head')
  end

  def ancestors
    result = []
    current = parent
    while current
      result << current
      current = current.parent
    end
    result
  end
end
