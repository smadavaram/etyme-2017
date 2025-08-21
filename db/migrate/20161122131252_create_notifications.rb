class CreateNotifications < ActiveRecord::Migration[4.2]
  def change
    create_table :notifications do |t|

      t.integer    :notifiable_id
      t.string     :notifiable_type
      t.text       :message
      t.integer    :status                ,default:0
      t.string     :title
      t.integer    :notification_type   ,  default:0


      t.timestamps null: false
    end
  end
end
