class AddColumnInEducation < ActiveRecord::Migration
  def change
    add_column :educations, :degree_level, :string
  end
end