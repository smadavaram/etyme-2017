class PayrollInfo < ApplicationRecord
  belongs_to :company
  has_many :tax_infos

  accepts_nested_attributes_for :tax_infos ,   allow_destroy: true, reject_if: :all_blank

end