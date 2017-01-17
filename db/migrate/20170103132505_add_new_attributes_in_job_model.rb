class AddNewAttributesInJobModel < ActiveRecord::Migration
  def change
    add_column :jobs ,:is_system_generated ,:boolean ,default:false
  end
end
