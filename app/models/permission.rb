class Permission < ActiveRecord::Base

  #Association & Relations
  has_and_belongs_to_many :roles

  #Validation
  validates_uniqueness_of :name

end
