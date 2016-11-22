class Notification < ActiveRecord::Base

  #Associations
  belongs_to :notifiable,polymorphic: true

end
