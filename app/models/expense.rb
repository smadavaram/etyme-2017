class Expense < ApplicationRecord

  belongs_to :contract, optional: true
  belongs_to :company_contact, optional: true, foreign_key: :account_id

  has_many :expense_accounts

  accepts_nested_attributes_for :expense_accounts, allow_destroy: true ,reject_if: :all_blank

  enum status:                [:opened, :cleared, :cancelled]

end
