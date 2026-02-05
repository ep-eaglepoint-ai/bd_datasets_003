class Organization < ApplicationRecord
  has_many :departments, dependent: :destroy
  has_many :users, dependent: :destroy
  has_many :purchase_orders, dependent: :destroy
  has_many :expense_reports, dependent: :destroy

  validates :name, presence: true
end
