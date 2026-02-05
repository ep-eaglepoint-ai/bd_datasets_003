class User < ApplicationRecord
  devise :database_authenticatable, :registerable, :recoverable, :rememberable, :validatable

  belongs_to :organization
  belongs_to :department, optional: true
  belongs_to :manager, class_name: 'User', optional: true
  has_many :direct_reports, class_name: 'User', foreign_key: :manager_id

  ROLES = %w[employee manager department_head director admin].freeze

  validates :role, inclusion: { in: ROLES }

  def full_name
    "#{first_name} #{last_name}".strip
  end

  def department_head?
    role == 'department_head'
  end

  def director?
    role == 'director'
  end

  def admin?
    role == 'admin'
  end
end
