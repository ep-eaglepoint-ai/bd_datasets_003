class ExpenseReport < ApplicationRecord
  belongs_to :submitter, class_name: 'User'
  belongs_to :organization

  STATUSES = %w[draft pending_approval approved rejected].freeze
  CATEGORIES = %w[travel meals supplies equipment other].freeze

  validates :title, presence: true
  validates :amount, presence: true, numericality: { greater_than: 0 }
  validates :status, inclusion: { in: STATUSES }
  validates :category, inclusion: { in: CATEGORIES }, allow_nil: true

  scope :pending, -> { where(status: 'pending_approval') }

  def submit_for_approval
    update!(status: 'pending_approval')
  end
end
