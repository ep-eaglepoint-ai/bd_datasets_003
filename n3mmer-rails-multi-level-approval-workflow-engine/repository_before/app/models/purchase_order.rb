class PurchaseOrder < ApplicationRecord
  belongs_to :requester, class_name: 'User'
  belongs_to :organization

  STATUSES = %w[draft pending_approval approved rejected].freeze

  validates :title, presence: true
  validates :amount, presence: true, numericality: { greater_than: 0 }
  validates :status, inclusion: { in: STATUSES }

  scope :pending, -> { where(status: 'pending_approval') }
  scope :approved, -> { where(status: 'approved') }

  def submit_for_approval
    update!(status: 'pending_approval')
  end
end
