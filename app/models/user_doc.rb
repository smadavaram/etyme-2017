class UserDoc < ActiveRecord::Base

  #Associations
  belongs_to :company_doc
  belongs_to :user

  #Validations
  validates_presence_of  :company_doc,:user, on: :create
end
