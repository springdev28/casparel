/**
 * @fileOverview Design-system role: implements or demonstrates Button Group in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
import { Bold, Italic, Underline } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '../../components/ui/button-group';
import { Row } from '../parts';

export function ButtonGroupDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6">
      <Row label="Grouped actions">
        <ButtonGroup>
          <Button variant="outline" size="icon" aria-label="Bold">
            <Bold />
          </Button>
          <ButtonGroupSeparator />
          <Button variant="outline" size="icon" aria-label="Italic">
            <Italic />
          </Button>
          <Button variant="outline" size="icon" aria-label="Underline">
            <Underline />
          </Button>
        </ButtonGroup>
      </Row>
      <Row label="Attached label">
        <ButtonGroup>
          <ButtonGroupText>https://</ButtonGroupText>
          <Button variant="outline">Copy link</Button>
        </ButtonGroup>
      </Row>
    </div>
  );
}
