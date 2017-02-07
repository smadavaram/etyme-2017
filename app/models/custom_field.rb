class CustomField < ActiveRecord::Base

  belongs_to :customizable, polymorphic: true
  validates  :value , presence: true,on: :create  , if: Proc.new{ |cf| cf.required && cf.customizable_type=="JobApplication"}
  # validates  required:presence: :true,on: :update ,if

end
