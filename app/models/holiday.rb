class Holiday < ApplicationRecord
  validates_date :date
  belongs_to :company
end
