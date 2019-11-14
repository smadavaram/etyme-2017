class Location < ApplicationRecord

  # validates :name , presence: true


  belongs_to  :company, optional: true
  # has_many    :jobs
  belongs_to  :address, optional: true

  accepts_nested_attributes_for :address, allow_destroy: true ,reject_if: :all_blank

end
