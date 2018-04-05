class AddColumnInAddress < ActiveRecord::Migration[5.1]
  def change
    add_column :addresses, :from_date, :date
    add_column :addresses, :to_date, :date, default: '9999/12/31'

    add_reference :addresses, :addressable, polymorphic: true
  end
end
