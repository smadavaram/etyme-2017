class Location < ActiveRecord::Base

  validates :name , presence: true

  belongs_to  :company
  # has_many    :jobs
  belongs_to  :address

  accepts_nested_attributes_for :address, allow_destroy: true ,reject_if: :all_blank

end
