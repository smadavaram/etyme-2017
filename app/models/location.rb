class Location < ActiveRecord::Base

  belongs_to  :company
  has_many    :jobs
  belongs_to  :address

  #nested Attributes
  accepts_nested_attributes_for :address, :allow_destroy => true ,:reject_if => :all_blank

end
