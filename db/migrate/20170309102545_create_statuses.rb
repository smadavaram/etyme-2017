class CreateStatuses < ActiveRecord::Migration[4.2]
  def change
    create_table :statuses do |t|
      t.belongs_to :statusable , polymorphic: true
      t.belongs_to :user
      t.string     :note
      t.integer    :status_type
      t.timestamps null: false
    end
  end
end
