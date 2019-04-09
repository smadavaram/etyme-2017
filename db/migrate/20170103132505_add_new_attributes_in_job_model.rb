class AddNewAttributesInJobModel < ActiveRecord::Migration[4.2]
  def change
    add_column :jobs ,:is_system_generated ,:boolean ,default:false
  end
end
