class Notification < ActiveRecord::Base

  #Associations
  belongs_to :notifiable,polymorphic: true

  #Scopes
  default_scope { order(created_at: :desc) }


end
