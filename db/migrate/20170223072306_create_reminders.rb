class CreateReminders < ActiveRecord::Migration[4.2]
  def change
    create_table :reminders do |t|
      t.string     :title
      t.datetime   :remind_at
      t.integer    :status ,default: 0
      t.belongs_to :user
      t.references :reminderable, polymorphic: true, index: true
      t.timestamps null: false
    end
  end
end
