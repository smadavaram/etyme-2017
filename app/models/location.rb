class Location < ApplicationRecord

  # validates :name , presence: true

  attr_accessor :locations


  belongs_to  :company, optional: true
  # has_many    :jobs
  belongs_to  :address, optional: true

  accepts_nested_attributes_for :address, allow_destroy: true ,reject_if: :all_blank

end
